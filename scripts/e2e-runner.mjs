import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const defaultProjectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultServerPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
const defaultPlaywrightPath = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143,
};

class CancellationError extends Error {
  constructor(signal) {
    super(`E2E run cancelled by ${signal}`);
    this.name = "CancellationError";
    this.signal = signal;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function terminalResult(child, error = null) {
  return {
    code: child.exitCode,
    signal: child.signalCode,
    error,
  };
}

export function isChildTerminal(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

export function observeChild(child) {
  let closeResult;
  let terminalOutcome;
  let resolveClose;
  let resolveTerminal;

  const close = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const terminal = new Promise((resolve) => {
    resolveTerminal = resolve;
  });

  const observation = {
    child,
    close,
    terminal,
    termination: null,
    get closed() {
      return closeResult !== undefined;
    },
    get terminalResult() {
      return terminalOutcome;
    },
  };

  const settleTerminal = (result) => {
    if (terminalOutcome === undefined) {
      terminalOutcome = result;
      resolveTerminal(result);
    }
  };
  const settleClose = (result) => {
    settleTerminal(result);
    if (closeResult === undefined) {
      closeResult = result;
      resolveClose(result);
    }
  };

  child.once("exit", (code, signal) => {
    settleTerminal({ code, signal, error: null });
  });
  child.once("close", (code, signal) => {
    settleClose({ code, signal, error: null });
  });
  child.once("error", (error) => {
    settleClose(terminalResult(child, error));
  });

  // A caller can safely observe a child after its events have already fired.
  // Runner-owned children are observed immediately after spawn, so their close
  // promises remain tied to the real close event.
  if (isChildTerminal(child)) {
    settleClose(terminalResult(child));
  }

  return observation;
}

function abortReason(signal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("E2E operation aborted");
}

function throwIfAborted(signal) {
  if (signal.aborted) {
    throw abortReason(signal);
  }
}

function abortableWait(milliseconds, signal) {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function describeResult(result) {
  if (result.error) {
    return result.error.message;
  }
  if (result.signal) {
    return `signal ${result.signal}`;
  }
  return `exit code ${result.code ?? 1}`;
}

function waitForOwnedReadiness(
  server,
  token,
  port,
  { signal, timeoutMilliseconds },
) {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(
        reject,
        new Error(
          `Owned production server did not send readiness within ${timeoutMilliseconds}ms`,
        ),
      );
    }, timeoutMilliseconds);

    const cleanup = () => {
      clearTimeout(timeout);
      server.child.off("message", onMessage);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (settle, value) => {
      if (!settled) {
        settled = true;
        cleanup();
        settle(value);
      }
    };
    const onMessage = (message) => {
      if (
        message?.type === "quantforge-ready" &&
        message.token === token &&
        message.port === port &&
        message.pid === server.child.pid
      ) {
        finish(resolve, message);
      }
    };
    const onAbort = () => finish(reject, abortReason(signal));

    server.child.on("message", onMessage);
    signal.addEventListener("abort", onAbort, { once: true });
    server.terminal.then((result) => {
      finish(
        reject,
        new Error(
          `Owned production server exited before readiness (${describeResult(result)})`,
        ),
      );
    });
  });
}

async function waitForHealth(
  server,
  healthURL,
  { signal, timeoutMilliseconds },
) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (server.terminalResult || isChildTerminal(server.child)) {
      const result = server.terminalResult ?? terminalResult(server.child);
      throw new Error(
        `Owned production server exited before health check (${describeResult(result)})`,
      );
    }

    try {
      const requestTimeout = AbortSignal.timeout(
        Math.max(1, Math.min(1_000, deadline - Date.now())),
      );
      const requestSignal = AbortSignal.any([signal, requestTimeout]);
      const response = await Promise.race([
        fetch(healthURL, { signal: requestSignal }),
        server.terminal.then((result) => {
          throw new Error(
            `Owned production server exited during health check (${describeResult(result)})`,
          );
        }),
      ]);

      if (
        response.status === 200 &&
        (await response.text()) === '{"status":"ok"}'
      ) {
        return;
      }
    } catch {
      throwIfAborted(signal);
      if (server.terminalResult || isChildTerminal(server.child)) {
        const result = server.terminalResult ?? terminalResult(server.child);
        throw new Error(
          `Owned production server exited during health check (${describeResult(result)})`,
        );
      }
      // Connection errors and a not-yet-ready response are retried below.
    }

    await Promise.race([
      abortableWait(100, signal),
      server.terminal.then((result) => {
        throw new Error(
          `Owned production server exited during health check (${describeResult(result)})`,
        );
      }),
    ]);
  }

  throw new Error(`Owned production server did not become healthy at ${healthURL}`);
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
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

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function waitForCondition(predicate, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await wait(25);
  }

  return predicate();
}

async function runTaskkill(pid, timeoutMilliseconds) {
  const taskkill = observeChild(
    spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }),
  );
  const completed = await Promise.race([
    taskkill.close.then(() => true),
    wait(timeoutMilliseconds).then(() => false),
  ]);

  if (!completed && !isChildTerminal(taskkill.child)) {
    taskkill.child.kill("SIGKILL");
    await Promise.race([taskkill.close, wait(250)]);
  }
}

async function waitForClose(child, timeoutMilliseconds) {
  return Promise.race([
    child.close.then(() => true),
    wait(timeoutMilliseconds).then(() => false),
  ]);
}

export function terminateProcessTree(
  observed,
  { graceMilliseconds = 1_500, forceMilliseconds = 1_500 } = {},
) {
  if (!observed) {
    return Promise.resolve();
  }
  if (observed.termination) {
    return observed.termination;
  }

  observed.termination = (async () => {
    const { child } = observed;
    if (observed.closed) {
      return;
    }

    if (process.platform === "win32") {
      if (!isChildTerminal(child)) {
        await runTaskkill(child.pid, graceMilliseconds + forceMilliseconds);
      }
    } else {
      signalProcessGroup(child.pid, "SIGTERM");
      const groupStopped = await waitForCondition(
        () => !processGroupExists(child.pid),
        graceMilliseconds,
      );
      if (!groupStopped) {
        signalProcessGroup(child.pid, "SIGKILL");
        await waitForCondition(
          () => !processGroupExists(child.pid),
          forceMilliseconds,
        );
      }
    }

    if (!isChildTerminal(child) && !observed.closed) {
      child.kill("SIGKILL");
    }

    const closed = await waitForClose(observed, forceMilliseconds);
    if (!closed && !isChildTerminal(child)) {
      throw new Error(`Timed out terminating process tree rooted at ${child.pid}`);
    }
  })();

  return observed.termination;
}

function pipeOutput(child, output) {
  child.stdout?.pipe(output.stdout, { end: false });
  child.stderr?.pipe(output.stderr, { end: false });
}

function installCancellationHandlers(signalTarget, controller, beginCleanup) {
  let cancellationSignal = null;
  const handlers = new Map();

  for (const signal of Object.keys(signalExitCodes)) {
    const handler = () => {
      if (!cancellationSignal) {
        cancellationSignal = signal;
        controller.abort(new CancellationError(signal));
      }
      void beginCleanup().catch(() => {});
    };
    handlers.set(signal, handler);
    signalTarget.on(signal, handler);
  }

  return {
    get signal() {
      return cancellationSignal;
    },
    dispose() {
      for (const [signal, handler] of handlers) {
        signalTarget.off(signal, handler);
      }
    },
  };
}

function resultExitCode(result) {
  return result.error || result.signal ? 1 : (result.code ?? 1);
}

export async function runE2E({
  projectRoot = defaultProjectRoot,
  serverPath = defaultServerPath,
  playwrightPath = defaultPlaywrightPath,
  port = 4173,
  playwrightArguments = [],
  serverEnv = {},
  playwrightEnv = {},
  signalTarget = process,
  output = { stdout: process.stdout, stderr: process.stderr },
  readinessTimeoutMilliseconds = 15_000,
  healthTimeoutMilliseconds = 15_000,
} = {}) {
  const controller = new AbortController();
  const readyToken = randomUUID();
  const healthURL = `http://127.0.0.1:${port}/health`;
  let server;
  let playwright;
  let cleanupPromise;
  let exitCode;
  let failure;
  let cleanupFailure;

  const cleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.allSettled([
        terminateProcessTree(playwright),
        terminateProcessTree(server),
      ]).then((results) => {
        const errors = results
          .filter(({ status }) => status === "rejected")
          .map(({ reason }) => reason);
        if (errors.length > 0) {
          throw new AggregateError(errors, "E2E process cleanup failed");
        }
      });
    }
    return cleanupPromise;
  };
  const cancellation = installCancellationHandlers(
    signalTarget,
    controller,
    cleanup,
  );

  try {
    const serverChild = spawn(process.execPath, [serverPath], {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        ...serverEnv,
        PORT: String(port),
        QUANTFORGE_READY_TOKEN: readyToken,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    server = observeChild(serverChild);
    pipeOutput(serverChild, output);

    await waitForOwnedReadiness(server, readyToken, port, {
      signal: controller.signal,
      timeoutMilliseconds: readinessTimeoutMilliseconds,
    });
    await waitForHealth(server, healthURL, {
      signal: controller.signal,
      timeoutMilliseconds: healthTimeoutMilliseconds,
    });
    throwIfAborted(controller.signal);

    const playwrightChild = spawn(
      process.execPath,
      [playwrightPath, "test", ...playwrightArguments],
      {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          ...playwrightEnv,
          QUANTFORGE_E2E_EXTERNAL_SERVER: "true",
        },
        stdio: ["inherit", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    playwright = observeChild(playwrightChild);
    pipeOutput(playwrightChild, output);

    const completed = await Promise.race([
      playwright.terminal.then((result) => ({ owner: "playwright", result })),
      server.terminal.then((result) => ({ owner: "server", result })),
    ]);

    throwIfAborted(controller.signal);
    if (
      completed.owner === "server" ||
      server.terminalResult ||
      isChildTerminal(server.child)
    ) {
      const result =
        completed.owner === "server"
          ? completed.result
          : (server.terminalResult ?? terminalResult(server.child));
      throw new Error(
        `Owned production server exited while Playwright was running (${describeResult(result)})`,
      );
    }

    exitCode = resultExitCode(completed.result);
  } catch (error) {
    failure = error;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupFailure = error;
    } finally {
      cancellation.dispose();
    }
  }

  if (cleanupFailure) {
    throw failure && !cancellation.signal
      ? new AggregateError(
          [failure, cleanupFailure],
          "E2E run and cleanup failed",
        )
      : cleanupFailure;
  }
  if (cancellation.signal) {
    return signalExitCodes[cancellation.signal];
  }
  if (failure) {
    throw failure;
  }
  return exitCode ?? 1;
}
