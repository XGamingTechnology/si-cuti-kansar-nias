import { EmployeeService } from "@/application/employees/service";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaEmployeeRepository } from "./prisma-employee-repository";

export function createEmployeeRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    employees: new EmployeeService(
      new PrismaEmployeeRepository(runtime.database),
    ),
  };
}
