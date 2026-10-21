import { app } from "./app";
import { env } from "./config/env";
import { runtimeState } from "./http/runtimeState";
import { db } from "./infra/db/mysql/connection";

const server = app.listen(env.port, () => {
  console.info(JSON.stringify({ level: "info", event: "server_started", port: env.port }));
});

let stopping = false;

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  runtimeState.shuttingDown = true;
  console.info(JSON.stringify({ level: "info", event: "server_stopping", signal }));

  const timeout = setTimeout(() => {
    console.error(JSON.stringify({ level: "error", event: "shutdown_timeout" }));
    server.closeAllConnections();
    process.exit(1);
  }, env.shutdownTimeoutMs);
  timeout.unref();

  server.close((httpError) => {
    void (async () => {
      let failed = Boolean(httpError);
      try {
        await db.end();
      } catch {
        failed = true;
      } finally {
        clearTimeout(timeout);
        console.info(JSON.stringify({
          level: failed ? "error" : "info",
          event: "server_stopped",
        }));
        process.exitCode = failed ? 1 : 0;
      }
    })();
  });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
