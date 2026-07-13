import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  observeChild,
  runE2E,
  terminateProcessTree,
} from "./e2e-runner.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const productionServerPath = path.join(projectRoot, "server.mjs");
const fixturePath = path.join(
  scriptsDirectory,
  "test-fixtures",
  "process-tree.mjs",
);

function quietOutput() {
  return {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, description, timeout = 8_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await wait(25);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    if (error.code === "EPERM") {
      return true;
    }
    throw error;
  }
}

function forceKill(pid) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
}

async function readPidRecords(pidFile) {
  let contents;
  try {
    contents = await readFile(pidFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return contents
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test(
  "rejects a health-compatible process already occupying the E2E port",
  { timeout: 20_000 },
  async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "quantforge-stale-port-"),
    );
    const playwrightMarker = path.join(temporaryDirectory, "playwright-started");
    let healthRequests = 0;
    const staleServer = http.createServer((request, response) => {
      if (request.url === "/health") {
        healthRequests += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"status":"ok"}');
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<main>stale QuantForge</main>");
    });

    try {
      await listen(staleServer, 4173);

      await assert.rejects(
        runE2E({
          projectRoot,
          serverPath: productionServerPath,
          playwrightPath: fixturePath,
          port: 4173,
          signalTarget: new EventEmitter(),
          output: quietOutput(),
          playwrightEnv: {
            RUN_E2E_FIXTURE_ROLE: "marker",
            RUN_E2E_MARKER: playwrightMarker,
          },
        }),
        /owned production server exited before readiness/iu,
      );

      assert.equal(
        existsSync(playwrightMarker),
        false,
        "Playwright must not launch against the stale health-compatible server",
      );
      assert.equal(
        healthRequests,
        0,
        "health polling must wait for the owned child's readiness handshake",
      );
    } finally {
      await closeServer(staleServer);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  },
);

test(
  "an already signal-terminated child has a settled close guard",
  { timeout: 10_000 },
  async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)"],
      { stdio: "ignore", windowsHide: true },
    );

    await once(child, "spawn");
    child.kill("SIGTERM");
    await once(child, "close");

    assert.equal(
      child.exitCode !== null || child.signalCode !== null,
      true,
      "a signal code is terminal even when exitCode remains null",
    );

    const observedAfterClose = observeChild(child);
    const closeResult = await Promise.race([
      observedAfterClose.close,
      wait(500).then(() => {
        throw new Error("close guard missed an already-closed child");
      }),
    ]);

    assert.equal(
      closeResult.signal !== null || closeResult.code !== null,
      true,
    );
    await terminateProcessTree(observedAfterClose, { graceMilliseconds: 50 });
  },
);

test(
  "fails and stops Playwright when the owned server exits during the run",
  { timeout: 20_000 },
  async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "quantforge-server-exit-"),
    );
    const pidFile = path.join(temporaryDirectory, "pids.jsonl");
    const probe = http.createServer();
    const port = await listen(probe, 0);
    await closeServer(probe);
    let records = [];

    try {
      await assert.rejects(
        runE2E({
          projectRoot,
          serverPath: fixturePath,
          playwrightPath: fixturePath,
          port,
          signalTarget: new EventEmitter(),
          output: quietOutput(),
          serverEnv: {
            RUN_E2E_FIXTURE_ROLE: "server",
            RUN_E2E_PID_FILE: pidFile,
            RUN_E2E_EXIT_AFTER_PLAYWRIGHT: "true",
            RUN_E2E_NO_DESCENDANT: "true",
          },
          playwrightEnv: {
            RUN_E2E_FIXTURE_ROLE: "playwright",
            RUN_E2E_PID_FILE: pidFile,
          },
        }),
        /owned production server exited while Playwright was running/iu,
      );

      records = await readPidRecords(pidFile);
      assert.equal(
        records.some(({ role }) => role === "playwright"),
        true,
        "the fixture must prove Playwright had started",
      );
      for (const { pid, role } of records.filter(({ role }) =>
        role.startsWith("playwright"),
      )) {
        await waitFor(
          () => !isProcessAlive(pid),
          `${role} process ${pid} to terminate after server failure`,
        );
      }
    } finally {
      records = records.length > 0 ? records : await readPidRecords(pidFile);
      for (const { pid } of records) {
        if (isProcessAlive(pid)) {
          forceKill(pid);
        }
      }
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  },
);

for (const cancellationSignal of ["SIGINT", "SIGTERM"]) {
  test(
    `${cancellationSignal} removes server and Playwright process trees on ${process.platform}`,
    { timeout: 20_000 },
    async () => {
      const temporaryDirectory = await mkdtemp(
        path.join(tmpdir(), "quantforge-cancellation-"),
      );
      const pidFile = path.join(temporaryDirectory, "pids.jsonl");
      const probe = http.createServer();
      const port = await listen(probe, 0);
      await closeServer(probe);
      const signalTarget = new EventEmitter();
      let records = [];

      const run = runE2E({
        projectRoot,
        serverPath: fixturePath,
        playwrightPath: fixturePath,
        port,
        signalTarget,
        output: quietOutput(),
        serverEnv: {
          RUN_E2E_FIXTURE_ROLE: "server",
          RUN_E2E_PID_FILE: pidFile,
        },
        playwrightEnv: {
          RUN_E2E_FIXTURE_ROLE: "playwright",
          RUN_E2E_PID_FILE: pidFile,
        },
      });

      try {
        records = await waitFor(async () => {
          const current = await readPidRecords(pidFile);
          const roles = new Set(current.map(({ role }) => role));
          return [
            "server",
            "server-child",
            "playwright",
            "playwright-child",
          ].every((role) => roles.has(role))
            ? current
            : false;
        }, "both spawned process trees");

        signalTarget.emit(cancellationSignal, cancellationSignal);
        signalTarget.emit(cancellationSignal, cancellationSignal);
        const code = await run;
        assert.equal(code, cancellationSignal === "SIGINT" ? 130 : 143);

        for (const { pid, role } of records) {
          await waitFor(
            () => !isProcessAlive(pid),
            `${role} process ${pid} to terminate`,
          );
        }
      } finally {
        signalTarget.emit(cancellationSignal, cancellationSignal);
        for (const { pid } of records) {
          if (isProcessAlive(pid)) {
            forceKill(pid);
          }
        }
        await run.catch(() => {});
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
  );
}
