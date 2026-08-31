import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("M2 identity database structure", () => {
  const database = createDatabaseClient();

  afterAll(() => database.$disconnect());

  it("enforces the approved identity uniqueness constraints", async () => {
    const constraints = await database.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'Employee_nip_key',
          'User_employeeId_key',
          'AuthenticationIdentity_provider_providerSubject_key',
          'AuthenticationIdentity_userId_provider_key',
          'Session_tokenHash_key'
        )
      ORDER BY indexname
    `;

    expect(constraints).toHaveLength(5);
    expect(constraints.every(({ indexdef }) => indexdef.includes("UNIQUE"))).toBe(true);
  });

  it("keeps Session attached to exactly one AuthenticationIdentity principal", async () => {
    const columns = await database.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Session'
      ORDER BY ordinal_position
    `;
    const foreignKeys = await database.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = '"Session"'::regclass
        AND contype = 'f'
    `;

    expect(columns.map(({ column_name }) => column_name)).not.toContain("userId");
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]?.definition).toContain(
      'FOREIGN KEY ("authenticationIdentityId") REFERENCES "AuthenticationIdentity"(id)',
    );
    expect(foreignKeys[0]?.definition).toContain("ON UPDATE RESTRICT ON DELETE RESTRICT");
  });

  it("restricts supervisor deletion and rejects direct self-reference", async () => {
    const constraints = await database.$queryRaw<Array<{ name: string; definition: string }>>`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = '"Employee"'::regclass
        AND conname IN (
          'Employee_directSupervisorId_fkey',
          'Employee_directSupervisor_not_self'
        )
      ORDER BY conname
    `;

    expect(constraints).toHaveLength(2);
    const definitions = Object.fromEntries(
      constraints.map(({ name, definition }) => [name, definition]),
    );
    expect(definitions.Employee_directSupervisorId_fkey).toContain(
      'FOREIGN KEY ("directSupervisorId") REFERENCES "Employee"(id)',
    );
    expect(definitions.Employee_directSupervisorId_fkey).toContain(
      "ON UPDATE RESTRICT ON DELETE RESTRICT",
    );
    expect(definitions.Employee_directSupervisor_not_self).toContain(
      '"directSupervisorId" <> id',
    );
  });

  it("creates only the approved non-unique lookup indexes", async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexdef NOT LIKE 'CREATE UNIQUE INDEX%'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY indexname
    `;

    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      "Employee_directSupervisorId_idx",
      "Session_authenticationIdentityId_revokedAt_idx",
      "Session_expiresAt_idx",
    ]);
  });
});
