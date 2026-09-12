import { describe, expect, it, vi } from "vitest";
import {
  LeaveWorkflowService,
  PermissionWorkflowService,
  WorkflowError,
  type LeaveRequestRecord,
  type PermissionRequestRecord,
  type TransitionWrite,
  type WorkflowRepository,
  type WorkflowTransaction,
} from "@/application/workflow";
import type { Principal } from "@/modules/auth/service";

const owner: Principal = {
  userId: "user-owner",
  employeeId: "employee-owner",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};
const other: Principal = {
  ...owner,
  userId: "user-other",
  employeeId: "employee-other",
};
const admin: Principal = {
  ...owner,
  userId: "user-admin",
  employeeId: "employee-admin",
  role: "ADMIN_KEPEGAWAIAN",
};

const leave: LeaveRequestRecord = {
  id: "leave-1",
  employeeId: owner.employeeId,
  employee: {
    id: owner.employeeId,
    nip: "UAT-EMP-001",
    fullName: "Pegawai Uji",
    positionTitle: "Staf",
    workUnit: "Unit Uji",
  },
  status: "DRAFT",
  currentRevisionNumber: 1,
  currentRevision: {
    id: "leave-revision-1",
    requestId: "leave-1",
    revisionNumber: 1,
    leaveType: "SICK",
    startDate: "2026-09-08",
    endDate: "2026-09-08",
    reason: "Pengujian",
    calculatedWorkingDays: null,
    submittedAt: null,
  },
};
const permission: PermissionRequestRecord = {
  id: "permission-1",
  employeeId: owner.employeeId,
  employee: {
    id: owner.employeeId,
    nip: "UAT-EMP-001",
    fullName: "Pegawai Uji",
    positionTitle: "Staf",
    workUnit: "Unit Uji",
  },
  status: "DRAFT",
  currentRevisionNumber: 1,
  currentRevision: {
    id: "permission-revision-1",
    requestId: "permission-1",
    revisionNumber: 1,
    permissionTypeId: "permission-type-1",
    startDate: "2026-09-08",
    endDate: "2026-09-08",
    reason: "Pengujian",
    submittedAt: null,
  },
};

function repository(overrides: Partial<WorkflowRepository> = {}) {
  return {
    getLeave: vi.fn(async () => leave),
    getPermission: vi.fn(async () => permission),
    ...overrides,
  } as unknown as WorkflowRepository;
}

describe("workflow application policy", () => {
  it("enforces Pegawai owner isolation while allowing Admin reads", async () => {
    const service = new LeaveWorkflowService(repository());
    await expect(service.get(other, leave.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.get(admin, leave.id)).resolves.toEqual(leave);
  });

  it("filters Pegawai list by their employeeId while Admin may list all", async () => {
    const listLeaves = vi.fn(async () => [leave]);
    const service = new LeaveWorkflowService(repository({ listLeaves }));

    await expect(service.list(owner)).resolves.toEqual([leave]);
    expect(listLeaves).toHaveBeenNthCalledWith(1, owner.employeeId);

    await expect(service.list(admin)).resolves.toEqual([leave]);
    expect(listLeaves).toHaveBeenNthCalledWith(2, undefined);
  });

  it("requires a reason for return and rejection", () => {
    const service = new LeaveWorkflowService(repository());
    expect(() =>
      service.returnForCorrection(admin, leave.id, " ", "return-1"),
    ).toThrow(WorkflowError);
    expect(() => service.reject(admin, leave.id, "", "reject-1")).toThrow(
      WorkflowError,
    );
  });

  it("requires an evidence reference for approval", () => {
    const service = new PermissionWorkflowService(repository());
    expect(() =>
      service.approve(admin, permission.id, " ", "approve-1"),
    ).toThrow(WorkflowError);
  });

  it("does not access annual balance during PermissionRequest submission", async () => {
    const append = vi.fn(async (input: TransitionWrite) => ({
      id: "transition-1",
      ...input,
    }));
    const transaction = {
      lockPermissionRequest: vi.fn(async () => permission),
      findPermissionTransitionByKey: vi.fn(async () => null),
      permissionTypeIsActive: vi.fn(async () => true),
      submitPermissionRevision: vi.fn(async () => undefined),
      setPermissionStatus: vi.fn(async () => undefined),
      appendPermissionTransition: append,
      get annualBalanceRepository(): never {
        throw new Error("PermissionRequest tidak boleh mengakses saldo cuti.");
      },
    } as unknown as WorkflowTransaction;
    const service = new PermissionWorkflowService(
      repository({ transaction: (work) => work(transaction) }),
    );

    await expect(
      service.submit(owner, permission.id, "permission-submit-1"),
    ).resolves.toMatchObject({
      toStatus: "SUBMITTED",
    });
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects an inactive PermissionType at the submission boundary", async () => {
    const transaction = {
      lockPermissionRequest: vi.fn(async () => permission),
      findPermissionTransitionByKey: vi.fn(async () => null),
      permissionTypeIsActive: vi.fn(async () => false),
    } as unknown as WorkflowTransaction;
    const service = new PermissionWorkflowService(
      repository({ transaction: (work) => work(transaction) }),
    );
    await expect(
      service.submit(owner, permission.id, "permission-submit-2"),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
