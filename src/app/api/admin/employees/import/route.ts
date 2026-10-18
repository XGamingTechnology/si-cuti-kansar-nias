import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  employeeMutation,
  employeeErrorResponse,
} from "@/application/employees/http";
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
  if (!request.body) throw new EmployeeError("VALIDATION", "Pilih file Excel.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new EmployeeError(
          "VALIDATION",
          "Ukuran unggahan maksimal 2 MB termasuk formulir.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type")! },
    body: Buffer.concat(chunks),
  })
    .formData()
    .catch(() => null);
  if (
    data &&
    ([...data.keys()].some((key) => key !== "file") ||
      data.getAll("file").length !== 1)
  )
    throw new EmployeeError(
      "VALIDATION",
      "Formulir impor hanya menerima satu file.",
    );
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
      const principal = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      requireAdmin(principal);
      employeeMutation(request, principal.userId);
      if (new URL(request.url).search)
        throw new EmployeeError("VALIDATION", "Parameter impor tidak dikenal.");
      const bytes = await workbook(request);
      if (commit) {
        const idempotencyKey = request.headers.get("idempotency-key");
        if (!z.string().uuid().safeParse(idempotencyKey).success)
          throw new EmployeeError(
            "VALIDATION",
            "Kunci konfirmasi impor tidak valid.",
          );
        const employees = await runtime.employeeImport.commit(bytes, {
          actorUserId: principal.userId,
          idempotencyKey: idempotencyKey!,
          requestHash: createHash("sha256").update(bytes).digest("hex"),
        });
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
