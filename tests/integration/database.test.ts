import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";

const run = process.env.DATABASE_URL ? describe : describe.skip;
run("PostgreSQL integration", () => {
  const database = createDatabaseClient(); afterAll(() => database.$disconnect());
  it("connects as a non-superuser", async () => {
    const [result] = await database.$queryRaw<Array<{ is_superuser: boolean }>>`SELECT current_setting('is_superuser') = 'on' AS is_superuser`;
    expect(result?.is_superuser).toBe(false);
  });
});
