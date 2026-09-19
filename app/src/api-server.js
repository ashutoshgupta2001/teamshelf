import { createApiApp } from "./bootstrap/create-api-app.js";
import { installProcessErrorLogging } from "./common/logging/process-errors.js";

const { app, container } = createApiApp();
installProcessErrorLogging(container.logger, "api");
const server = app.listen(
  container.config.get("app.port"),
  container.config.get("app.host"),
  () =>
    container.logger.info(
      {
        event: "api.started",
        host: container.config.get("app.host"),
        port: container.config.get("app.port"),
      },
      "TeamShelf API listening",
    ),
);
server.on("error", (error) => {
  container.logger.fatal(
    { event: "api.server_error", err: error },
    "API error",
  );
  process.exitCode = 1;
});

let shutdownStarted = false;
function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  container.logger.info(
    { event: "api.shutdown_started", signal },
    "stopping API",
  );
  server.close(async (error) => {
    try {
      await container.sequelize.close();
      if (error) throw error;
      container.logger.info(
        { event: "api.shutdown_completed", signal },
        "API stopped",
      );
      process.exitCode = 0;
    } catch (shutdownError) {
      container.logger.fatal(
        { event: "api.shutdown_failed", err: shutdownError, signal },
        "API shutdown failed",
      );
      process.exitCode = 1;
    }
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
