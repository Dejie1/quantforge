import http from "node:http";
import sirv from "sirv";

const FALLBACK_PORT = 3000;

function productionPort(value) {
  if (value === undefined || value.trim() === "") {
    return FALLBACK_PORT;
  }

  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 65_535
    ? candidate
    : FALLBACK_PORT;
}

const port = productionPort(process.env.PORT);
const serve = sirv("dist", { single: true, dev: false });

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }

  serve(request, response);
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`QuantForge listening on port ${port}\n`);
  if (
    typeof process.send === "function" &&
    process.env.QUANTFORGE_READY_TOKEN
  ) {
    process.send({
      type: "quantforge-ready",
      token: process.env.QUANTFORGE_READY_TOKEN,
      port,
      pid: process.pid,
    });
  }
});
