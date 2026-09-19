import { createWorker } from "./bootstrap/create-worker.js";
import { installProcessErrorLogging } from "./common/logging/process-errors.js";

const worker = createWorker();
installProcessErrorLogging(worker.container.logger, "worker");
worker.start();
worker.container.logger.info(
  {
    event: "worker.started",
    workerId: worker.container.services.workerService.workerId,
  },
  "TeamShelf worker started",
);
let shutdownStarted = false;
async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  worker.container.logger.info(
    { event: "worker.shutdown_started", signal },
    "stopping worker",
  );
  try {
    await worker.stop();
    worker.container.logger.info(
      { event: "worker.shutdown_completed", signal },
      "worker stopped",
    );
    process.exitCode = 0;
  } catch (error) {
    worker.container.logger.fatal(
      { event: "worker.shutdown_failed", err: error, signal },
      "worker shutdown failed",
    );
    process.exitCode = 1;
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
