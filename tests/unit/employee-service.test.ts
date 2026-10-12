import { describe, expect, it } from "vitest";
import {
  EmployeeError,
  EmployeeService,
  type Employee,
  type EmployeeRepository,
  type EmployeeWrite,
} from "@/application/employees/service";

const employeeId = "00000000-0000-4000-8000-000000000001";
const unknownEmployeeId = "00000000-0000-4000-8000-000000000099";

function fixture(initial: Employee[] = []) {
  const rows = [...initial];
  let sequence = 1;
  const identityUpdates: string[] = [];
  const repository: EmployeeRepository = {
    async list() {
      return rows;
    },
    async findById(id) {
      return rows.find((e) => e.id === id) ?? null;
    },
    async findByNip(nip) {
      return rows.find((e) => e.nip === nip) ?? null;
    },
    async create(input) {
      const row = {
        id: `generated-${sequence++}`,
        isActive: true,
        directSupervisorId: null,
        ...input,
      } as Employee;
      rows.push(row);
      return row;
    },
    async updateWithLocalIdentity(id, input) {
      const index = rows.findIndex((e) => e.id === id);
      rows[index] = { ...rows[index]!, ...input };
      identityUpdates.push(input.nip);
      return rows[index]!;
    },
    async setActive(id, isActive) {
      const index = rows.findIndex((e) => e.id === id);
      rows[index] = { ...rows[index]!, isActive };
      return rows[index]!;
    },
  };
  return { service: new EmployeeService(repository), rows, identityUpdates };
}
const input = (values: Partial<EmployeeWrite> = {}) => ({
  nip: "TEST-001",
  fullName: "Pegawai Uji",
  positionTitle: "Analis",
  workUnit: "Unit Uji",
  directSupervisorId: null,
  ...values,
});
const employee = (values: Partial<Employee> = {}) =>
  ({ id: employeeId, isActive: true, ...input(), ...values }) as Employee;

describe("EmployeeService", () => {
  it("creates with generated internal ID and stores trimmed values", async () => {
    const { service } = fixture();
    const result = await service.create(
      input({
        nip: " TEST-001 ",
        fullName: " Pegawai Uji ",
      }) as EmployeeWrite & { id: string },
    );
    expect(result).toMatchObject({
      id: "generated-1",
      nip: "TEST-001",
      fullName: "Pegawai Uji",
    });
  });
  it("rejects duplicate NIP safely", async () => {
    const { service } = fixture([employee()]);
    await expect(service.create(input())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it.each(["nip", "fullName", "positionTitle", "workUnit"] as const)(
    "rejects empty %s",
    async (field) => {
      const { service } = fixture();
      await expect(
        service.create(input({ [field]: "  " })),
      ).rejects.toBeInstanceOf(EmployeeError);
    },
  );
  it("updates fields and synchronizes the LOCAL identifier through the repository operation", async () => {
    const { service, identityUpdates } = fixture([employee()]);
    const result = await service.update(
      employeeId,
      input({ nip: "TEST-NEW", fullName: "Nama Baru" }),
    );
    expect(result.fullName).toBe("Nama Baru");
    expect(identityUpdates).toEqual(["TEST-NEW"]);
  });
  it("allows repository update when no LOCAL identity exists without provisioning one", async () => {
    const { service, rows } = fixture([employee()]);
    await service.update(employeeId, input({ nip: "NO-IDENTITY" }));
    expect(rows[0]?.nip).toBe("NO-IDENTITY");
  });
  it("rejects self and unknown supervisors", async () => {
    const { service } = fixture([employee()]);
    await expect(
      service.update(employeeId, input({ directSupervisorId: employeeId })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      service.update(
        employeeId,
        input({ directSupervisorId: unknownEmployeeId }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Atasan langsung tidak ditemukan.",
    });
  });
  it("preserves the safe response for a well-formed unknown supervisor", async () => {
    const { service } = fixture();
    await expect(
      service.create(input({ directSupervisorId: unknownEmployeeId })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Atasan langsung tidak ditemukan.",
    });
  });
  it("allows a null supervisor", async () => {
    const { service } = fixture([employee({ directSupervisorId: "old" })]);
    expect(
      (await service.update(employeeId, input({ directSupervisorId: null })))
        .directSupervisorId,
    ).toBeNull();
  });
  it("deactivates and reactivates while preserving the row", async () => {
    const { service, rows } = fixture([employee()]);
    expect((await service.setActive(employeeId, false)).isActive).toBe(false);
    expect(rows).toHaveLength(1);
    expect((await service.setActive(employeeId, true)).isActive).toBe(true);
  });
  it("exposes no hard-delete operation", () =>
    expect("delete" in new EmployeeService({} as EmployeeRepository)).toBe(
      false,
    ));
});
