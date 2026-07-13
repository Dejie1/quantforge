import { runE2E } from "./e2e-runner.mjs";

try {
  process.exitCode = await runE2E({
    playwrightArguments: process.argv.slice(2),
  });
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}
