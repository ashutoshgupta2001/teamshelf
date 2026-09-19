import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequelizeStorage, Umzug } from "umzug";
import { sequelize } from "./sequelize.js";
import { logger } from "../../common/logging/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrator = new Umzug({
  migrations: { glob: path.join(here, "../../../migrations/*.js") },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger,
});

try {
  if (process.argv[2] === "down") await migrator.down();
  else await migrator.up();
} finally {
  await sequelize.close();
}
