import { afterAll, afterEach, describe, expect, it } from "vitest";
import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaLeaveAuthorizedOfficialRepository } from "@/infrastructure/leave-authorized-official/prisma-repository";

const run = process.env.DATABASE_URL ? describe : describe.skip;
run("authorized leave official PostgreSQL persistence", () => {
  const database = createDatabaseClient();
  const service = new LeaveAuthorizedOfficialService(
    new PrismaLeaveAuthorizedOfficialRepository(database),
  );
  afterEach(() => database.leaveAuthorizedOfficialAssignment.deleteMany());
  afterAll(() => database.$disconnect());

  it("persists adjacent periods and resolves their inclusive boundaries", async () => {
    const first = await service.create({
      fullName: "Pejabat A Fiktif",
      nip: "000000000000000001",
      capacity: "DEFINITIVE",
      effectiveFrom: "2098-01-01",
      effectiveTo: "2098-06-30",
    });
    const second = await service.create({
      fullName: "Pejabat B Fiktif",
      nip: "000000000000000002",
      capacity: "PLT",
      effectiveFrom: "2098-07-01",
      effectiveTo: null,
    });
    await expect(service.resolve("2098-06-30")).resolves.toEqual(first);
    await expect(service.resolve("2098-07-01")).resolves.toEqual(second);
  });

  it("enforces the database period-order check as defense in depth", async () => {
    await expect(
      database.leaveAuthorizedOfficialAssignment.create({
        data: {
          fullName: "Pejabat Fiktif",
          nip: "000000000000000003",
          capacity: "PLH",
          effectiveFrom: new Date("2098-02-01T00:00:00Z"),
          effectiveTo: new Date("2098-01-31T00:00:00Z"),
        },
      }),
    ).rejects.toThrow();
  });
});
