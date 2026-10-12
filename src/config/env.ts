import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  PRIVATE_STORAGE_PATH: z.string().min(1),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(86400).default(28800),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export function parseServerEnvironment(
  input: Record<string, string | undefined> = process.env,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}
