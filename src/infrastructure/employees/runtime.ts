import { EmployeeService } from "@/application/employees/service";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaEmployeeRepository } from "./prisma-employee-repository";
import { EmployeeImportService } from "@/application/employees/import-service";
import { XlsxWorkbookReader } from "./xlsx-workbook-reader";

export function createEmployeeRuntime() {
  const runtime = createRuntimeAuthentication();
  const repository = new PrismaEmployeeRepository(runtime.database);
  return {
    ...runtime,
    employees: new EmployeeService(repository),
    employeeImport: new EmployeeImportService(
      new XlsxWorkbookReader(),
      repository,
    ),
  };
}
