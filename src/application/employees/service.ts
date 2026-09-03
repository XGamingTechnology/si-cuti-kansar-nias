export type Employee = Readonly<{
  id: string;
  nip: string;
  fullName: string;
  positionTitle: string;
  workUnit: string;
  isActive: boolean;
  directSupervisorId: string | null;
}>;

export type EmployeeWrite = Readonly<{
  nip: string;
  fullName: string;
  positionTitle: string;
  workUnit: string;
  directSupervisorId?: string | null;
}>;

export interface EmployeeRepository {
  list(): Promise<Employee[]>;
  findById(id: string): Promise<Employee | null>;
  findByNip(nip: string): Promise<Employee | null>;
  create(input: EmployeeWrite): Promise<Employee>;
  updateWithLocalIdentity(
    employeeId: string,
    input: EmployeeWrite,
  ): Promise<Employee>;
  setActive(employeeId: string, isActive: boolean): Promise<Employee>;
}

export type EmployeeErrorCode = "VALIDATION" | "CONFLICT" | "NOT_FOUND";
export class EmployeeError extends Error {
  constructor(
    public readonly code: EmployeeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EmployeeError";
  }
}

const limits = {
  nip: 32,
  fullName: 200,
  positionTitle: 200,
  workUnit: 200,
} as const;

function normalize(input: EmployeeWrite): EmployeeWrite {
  const normalized = {
    nip: input.nip?.trim(),
    fullName: input.fullName?.trim(),
    positionTitle: input.positionTitle?.trim(),
    workUnit: input.workUnit?.trim(),
    directSupervisorId: input.directSupervisorId?.trim() || null,
  };
  for (const field of [
    "nip",
    "fullName",
    "positionTitle",
    "workUnit",
  ] as const) {
    if (!normalized[field])
      throw new EmployeeError("VALIDATION", `${field} wajib diisi.`);
    if (normalized[field].length > limits[field])
      throw new EmployeeError(
        "VALIDATION",
        `${field} melebihi batas ${limits[field]} karakter.`,
      );
  }
  return normalized;
}

export class EmployeeService {
  constructor(private readonly repository: EmployeeRepository) {}

  list() {
    return this.repository.list();
  }
  findById(id: string) {
    return this.repository.findById(id);
  }

  async create(input: EmployeeWrite): Promise<Employee> {
    const value = normalize(input);
    await this.validateSupervisor(value.directSupervisorId ?? null);
    if (await this.repository.findByNip(value.nip))
      throw new EmployeeError("CONFLICT", "NIP sudah digunakan.");
    return this.repository.create(value);
  }

  async update(employeeId: string, input: EmployeeWrite): Promise<Employee> {
    const current = await this.requireEmployee(employeeId);
    const value = normalize(input);
    if (value.directSupervisorId === employeeId)
      throw new EmployeeError(
        "VALIDATION",
        "Pegawai tidak boleh menjadi atasan langsung dirinya sendiri.",
      );
    await this.validateSupervisor(value.directSupervisorId ?? null);
    const duplicate = await this.repository.findByNip(value.nip);
    if (duplicate && duplicate.id !== current.id)
      throw new EmployeeError("CONFLICT", "NIP sudah digunakan.");
    return this.repository.updateWithLocalIdentity(employeeId, value);
  }

  async setActive(employeeId: string, isActive: boolean): Promise<Employee> {
    await this.requireEmployee(employeeId);
    return this.repository.setActive(employeeId, isActive);
  }

  private async requireEmployee(id: string) {
    const employee = await this.repository.findById(id);
    if (!employee)
      throw new EmployeeError("NOT_FOUND", "Pegawai tidak ditemukan.");
    return employee;
  }

  private async validateSupervisor(id: string | null) {
    if (id && !(await this.repository.findById(id)))
      throw new EmployeeError("VALIDATION", "Atasan langsung tidak ditemukan.");
  }
}
