import "server-only";
import { parseDatabaseConfig } from "./runtime-schema";

export function readDatabaseConfig() {
  return parseDatabaseConfig(process.env);
}

export function getConfigurationReadiness() {
  const database = readDatabaseConfig();

  return {
    databaseConfigured: database !== null,
    writesEnabled: database?.writesEnabled ?? false,
    modelConfigured: Boolean(process.env.MODEL_API_KEY?.trim()),
    shoppingConfigured: Boolean(process.env.SERPAPI_API_KEY?.trim()),
  };
}
