import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  EmployeeImportService,
  type EmployeeWorkbookReader,
} from "@/application/employees/import-service";
import { EMPLOYEE_IMPORT_HEADERS } from "@/application/employees/import-service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaEmployeeRepository } from "@/infrastructure/employees/prisma-employee-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  describe.skip("Employee import persistence", () => {
    it("requires DATABASE_URL", () => undefined);
  });
else
  describe("Employee import persistence", () => {
    const database = createDatabaseClient();
    const marker = randomUUID().slice(0, 8);
    const nips: string[] = [];
    const reader = (rows: unknown[][]): EmployeeWorkbookReader => ({
      read: async () => rows,
    });
    const make = (rows: unknown[][]) =>
      new EmployeeImportService(
        reader(rows),
        new PrismaEmployeeRepository(database),
      );
    afterAll(async () => {
      await database.employee.deleteMany({ where: { nip: { in: nips } } });
      await database.$disconnect();
    });
    it("imports all valid rows transactionally without provisioning accounts", async () => {
      const a = `IMP-A-${marker}`,
        b = `IMP-B-${marker}`;
      nips.push(a, b);
      const created = await make([
        [...EMPLOYEE_IMPORT_HEADERS],
        [a, "Pegawai A", "Analis", "Unit", "TRUE"],
        [b, "Pegawai B", "Staf", "Unit", "TIDAK AKTIF"],
      ]).commit(new Uint8Array());
      expect(created).toHaveLength(2);
      expect(
        await database.user.count({
          where: { employeeId: { in: created.map((e) => e.id) } },
        }),
      ).toBe(0);
    });
    it("detects an existing NIP, never overwrites it, and writes no partial rows", async () => {
      const existing = `IMP-C-${marker}`,
        fresh = `IMP-D-${marker}`;
      nips.push(existing, fresh);
      await database.employee.create({
        data: {
          nip: existing,
          fullName: "Nama Asli",
          positionTitle: "Asli",
          workUnit: "Unit",
        },
      });
      const service = make([
        [...EMPLOYEE_IMPORT_HEADERS],
        [fresh, "Baru", "Staf", "Unit", "TRUE"],
        [existing, "Timpa", "Staf", "Unit", "TRUE"],
      ]);
      await expect(service.commit(new Uint8Array())).rejects.toThrow(
        "dibatalkan",
      );
      expect(
        await database.employee.findUnique({ where: { nip: existing } }),
      ).toMatchObject({ fullName: "Nama Asli" });
      expect(
        await database.employee.findUnique({ where: { nip: fresh } }),
      ).toBeNull();
    });
  });
