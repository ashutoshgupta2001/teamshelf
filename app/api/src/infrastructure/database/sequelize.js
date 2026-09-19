import { Sequelize } from "sequelize";
import { config } from "../../config/config.js";
import { logger } from "../../common/logging/logger.js";

export const sequelize = new Sequelize(config.get("database.url"), {
  dialect: "postgres",
  benchmark: true,
  logging: (_query, durationMs) =>
    logger.trace(
      { event: "database.query_completed", durationMs },
      "database query completed",
    ),
  dialectOptions: config.get("database.ssl")
    ? { ssl: { require: true, rejectUnauthorized: true } }
    : {},
  pool: {
    min: config.get("database.poolMin"),
    max: config.get("database.poolMax"),
  },
  define: { underscored: true, timestamps: true },
});
