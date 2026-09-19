export function installProcessErrorLogging(logger, component) {
  process.on("uncaughtException", (error) => {
    logger.fatal(
      { event: "process.uncaught_exception", component, err: error },
      "uncaught process exception",
    );
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal(
      { event: "process.unhandled_rejection", component, err: error },
      "unhandled promise rejection",
    );
    process.exit(1);
  });
}
