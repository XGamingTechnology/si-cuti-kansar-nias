import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { EmployeeService } from "@/application/employees/service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaEmployeeRepository } from "@/infrastructure/employees/prisma-employee-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  describe.skip("Employee lifecycle persistence", () => {
    it("requires DATABASE_URL", () => undefined);
  });
} else
  describe("Employee lifecycle persistence", () => {
    const database = createDatabaseClient();
    const service = new EmployeeService(new PrismaEmployeeRepository(database));
    const marker = randomUUID().slice(0, 8);
    const ids: string[] = [];
    afterAll(async () => {
      await database.session.deleteMany({
        where: {
          authenticationIdentity: { user: { employeeId: { in: ids } } },
        },
      });
      await database.localCredential.deleteMany({
        where: {
          authenticationIdentity: { user: { employeeId: { in: ids } } },
        },
      });
      await database.authenticationIdentity.deleteMany({
        where: { user: { employeeId: { in: ids } } },
      });
      await database.user.deleteMany({ where: { employeeId: { in: ids } } });
      await database.employee.deleteMany({ where: { id: { in: ids } } });
      await database.$disconnect();
    });
    it("enforces unique NIP and supervisor relationship constraints", async () => {
      const supervisor = await service.create({
        nip: `INT-S-${marker}`,
        fullName: "Supervisor Integrasi",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      });
      ids.push(supervisor.id);
      const report = await service.create({
        nip: `INT-R-${marker}`,
        fullName: "Pegawai Integrasi",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
        directSupervisorId: supervisor.id,
      });
      ids.push(report.id);
      expect(report.directSupervisorId).toBe(supervisor.id);
      await expect(
        database.employee.create({
          data: {
            nip: supervisor.nip,
            fullName: "Duplikat",
            positionTitle: "Uji",
            workUnit: "Uji",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      await expect(
        database.employee.update({
          where: { id: report.id },
          data: { directSupervisorId: report.id },
        }),
      ).rejects.toBeTruthy();
    });
    it("updates Employee NIP and an existing LOCAL identity in one transaction", async () => {
      const employee = await service.create({
        nip: `INT-A-${marker}`,
        fullName: "Identitas Integrasi",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      });
      ids.push(employee.id);
      const user = await database.user.create({
        data: { employeeId: employee.id, role: "PEGAWAI" },
      });
      await database.authenticationIdentity.create({
        data: {
          userId: user.id,
          provider: "LOCAL",
          providerSubject: employee.nip,
        },
      });
      const changed = `INT-B-${marker}`;
      await service.update(employee.id, {
        ...employee,
        nip: changed,
        directSupervisorId: null,
      });
      const persisted = await database.employee.findUnique({
        where: { id: employee.id },
        include: { user: { include: { authenticationIdentities: true } } },
      });
      expect(persisted?.nip).toBe(changed);
      expect(
        persisted?.user?.authenticationIdentities[0]?.providerSubject,
      ).toBe(changed);
    });
    it("deactivates without deleting User or authentication history", async () => {
      const employee = await service.create({
        nip: `INT-C-${marker}`,
        fullName: "Riwayat Integrasi",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      });
      ids.push(employee.id);
      const user = await database.user.create({
        data: { employeeId: employee.id, role: "PEGAWAI" },
      });
      await database.authenticationIdentity.create({
        data: {
          userId: user.id,
          provider: "LOCAL",
          providerSubject: employee.nip,
        },
      });
      await service.setActive(employee.id, false);
      const persisted = await database.employee.findUnique({
        where: { id: employee.id },
        include: { user: { include: { authenticationIdentities: true } } },
      });
      expect(persisted?.isActive).toBe(false);
      expect(persisted?.user).not.toBeNull();
      expect(persisted?.user?.authenticationIdentities).toHaveLength(1);
    });
  });
