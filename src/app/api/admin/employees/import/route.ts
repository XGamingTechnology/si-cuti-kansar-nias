import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { employeeErrorResponse } from "@/application/employees/http";
import { EmployeeError } from "@/application/employees/service";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
type Dependencies = ReturnType<typeof createEmployeeRuntime>;

async function workbook(request: Request): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES)
    throw new EmployeeError("VALIDATION", "Ukuran file maksimal 2 MB.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new EmployeeError("VALIDATION", "Unggah file Excel .xlsx.");
  const data = await request.formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx"))
    throw new EmployeeError("VALIDATION", "File harus berformat .xlsx.");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES)
    throw new EmployeeError(
      "VALIDATION",
      "Ukuran file harus antara 1 byte dan 2 MB.",
    );
  return new Uint8Array(await file.arrayBuffer());
}

export function createEmployeeImportHandlers(factory = createEmployeeRuntime) {
  const run = (commit: boolean) => async (request: Request) => {
    const runtime: Dependencies = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      const bytes = await workbook(request);
      if (commit) {
        const employees = await runtime.employeeImport.commit(bytes);
        return Response.json({ imported: employees.length }, { status: 201 });
      }
      return Response.json({
        preview: await runtime.employeeImport.preview(bytes),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        employeeErrorResponse(error) ??
        Response.json({ error: "Impor pegawai gagal." }, { status: 500 })
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
  return { POST: run(false), PUT: run(true) };
}
const handlers = createEmployeeImportHandlers();
export const POST = handlers.POST;
export const PUT = handlers.PUT;
