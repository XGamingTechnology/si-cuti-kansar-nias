import { parseServerEnvironment } from "@/config/env";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "./prisma-auth-repository";

export function createRuntimeAuthentication() {
  const environment = parseServerEnvironment();
  const database = createDatabaseClient(environment.DATABASE_URL);
  return { database, authentication: new AuthenticationService(new PrismaAuthRepository(database), environment.SESSION_TTL_SECONDS), environment };
}
