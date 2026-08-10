import { createDatabaseClient } from "./client";

export async function checkDatabaseConnection(): Promise<boolean> {
  const database = createDatabaseClient();
  try { await database.$queryRaw`SELECT 1`; return true; }
  catch { return false; }
  finally { await database.$disconnect(); }
}
