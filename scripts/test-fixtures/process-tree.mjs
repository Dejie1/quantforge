import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const role = process.env.RUN_E2E_FIXTURE_ROLE;
const pidFile = process.env.RUN_E2E_PID_FILE;
const fixturePath = fileURLToPath(import.meta.url);

function record(processRole, pid = process.pid) {
  if (pidFile) {
    appendFileSync(pidFile, `${JSON.stringify({ role: processRole, pid })}\n`);
  }
}

function remainRunning() {
  setInterval(() => {}, 1_000);
}

if (role === "marker") {
  writeFileSync(process.env.RUN_E2E_MARKER, "started\n");
} else if (role?.endsWith("-child")) {
  record(role);
  remainRunning();
} else if (role === "server" || role === "playwright") {
  record(role);
  if (process.env.RUN_E2E_NO_DESCENDANT !== "true") {
    const descendantRole = `${role}-child`;
    const descendant = spawn(process.execPath, [fixturePath], {
      env: {
        ...process.env,
        RUN_E2E_FIXTURE_ROLE: descendantRole,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    descendant.once("spawn", () => record(descendantRole, descendant.pid));
  }

  if (role === "server") {
    const port = Number(process.env.PORT);
    const server = http.createServer((request, response) => {
      if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"status":"ok"}');
        return;
      }
      response.writeHead(404);
      response.end();
    });
    server.listen(port, "0.0.0.0", () => {
      process.send?.({
        type: "quantforge-ready",
        token: process.env.QUANTFORGE_READY_TOKEN,
        port,
        pid: process.pid,
      });

      if (process.env.RUN_E2E_EXIT_AFTER_PLAYWRIGHT === "true") {
        const watcher = setInterval(() => {
          let records = "";
          try {
            records = readFileSync(pidFile, "utf8");
          } catch {
            return;
          }
          if (records.includes('"role":"playwright"')) {
            clearInterval(watcher);
            process.exit(23);
          }
        }, 10);
      }
    });
  } else {
    remainRunning();
  }
} else {
  throw new Error(`Unknown process-tree fixture role: ${role ?? "<missing>"}`);
}
