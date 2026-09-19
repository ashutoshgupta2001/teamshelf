import { createContainer } from "./container.js";

export function createWorker(overrides = {}) {
  const container = overrides.container || createContainer(overrides);
  let timer;
  let stopping = false;
  async function poll() {
    if (stopping) return;
    try {
      let processedJob;
      do {
        processedJob = await container.services.workerService.tick();
      } while (processedJob);
    } catch (error) {
      container.logger.error(
        { event: "worker.poll_failed", err: error },
        "worker poll failed",
      );
    }
    if (!stopping)
      timer = setTimeout(poll, container.config.get("jobs.pollIntervalMs"));
  }
  return {
    container,
    start: poll,
    async stop() {
      stopping = true;
      clearTimeout(timer);
      await container.sequelize.close();
    },
  };
}
