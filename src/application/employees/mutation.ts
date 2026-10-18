export type EmployeeMutation = Readonly<{
  actorUserId: string;
  expectedUpdatedAt?: string;
}>;
export type EmployeeImportMutation = EmployeeMutation &
  Readonly<{
    idempotencyKey: string;
    requestHash: string;
  }>;
