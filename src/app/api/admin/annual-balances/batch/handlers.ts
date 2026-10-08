import { z } from "zod";
import { EmployeeError } from "@/application/employees/service";
import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { createAnnualBalanceAdministrationRuntime } from "@/infrastructure/leave-balance/runtime";
import { balanceTemplateWorkbook } from "@/infrastructure/leave-balance/xlsx-balance-template";
import { AnnualBalanceAdministrationError } from "@/application/leave-balance/administration";
import {
  annualBalanceAdministrationErrorResponse,
  annualBalanceYear,
} from "@/application/leave-balance/administration-http";
import { MAX_BALANCE_IMPORT_ROWS } from "@/application/leave-balance/batch-import";

const MAX_BYTES = 2 * 1024 * 1024;
const invalid = (message: string) =>
  new AnnualBalanceAdministrationError("VALIDATION", message);
const confirmation = z.object({
  batchId: z.string().uuid(),
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmedRows: z
    .array(z.number().int().min(2))
    .min(1)
    .max(MAX_BALANCE_IMPORT_ROWS),
});

async function upload(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 65536)
    throw invalid("Ukuran file maksimal 2 MB.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw invalid("Unggah file Excel .xlsx.");
  // Bound the actual multipart stream too; Content-Length can be omitted or forged.
  const reader = request.body?.getReader();
  if (!reader) throw invalid("Unggah file Excel .xlsx.");
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES + 65536) {
        await reader.cancel();
        throw invalid("Ukuran file maksimal 2 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks);
  const data = await new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Uint8Array(body),
  })
    .formData()
    .catch(() => null);
  const file = data?.get("file");
  if (
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith(".xlsx") ||
    !file.size ||
    file.size > MAX_BYTES
  )
    throw invalid(
      "File harus berformat .xlsx, berisi data, dan maksimal 2 MB.",
    );
  return { data: data!, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export function createBalanceBatchHandler(
  action: "template" | "preview" | "commit",
  factory = createAnnualBalanceAdministrationRuntime,
) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      const principal = requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      const year = annualBalanceYear(request);
      if (action === "template") {
        const bytes = balanceTemplateWorkbook(
          await runtime.balanceImport.template(year),
        );
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": `attachment; filename="template-saldo-${year}.xlsx"`,
            "cache-control": "no-store",
          },
        });
      }
      const { data, bytes } = await upload(request);
      if (action === "preview")
        return Response.json(
          { preview: await runtime.balanceImport.preview(bytes, year) },
          { headers: { "cache-control": "no-store" } },
        );
      const parsed = confirmation.safeParse({
        batchId: data.get("batchId"),
        previewDigest: data.get("previewDigest"),
        confirmedRows: JSON.parse(String(data.get("confirmedRows") ?? "null")),
      });
      if (!parsed.success)
        throw invalid("Konfirmasi preview tidak valid. Lakukan preview ulang.");
      return Response.json(
        {
          result: await runtime.balanceImport.commit({
            ...parsed.data,
            bytes,
            selectedYear: year,
            actorUserId: principal.userId,
          }),
        },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof EmployeeError)
        return Response.json(
          { error: error.message, code: "VALIDATION" },
          { status: 422 },
        );
      if (error instanceof SyntaxError)
        return Response.json(
          { error: "Konfirmasi preview tidak valid.", code: "VALIDATION" },
          { status: 422 },
        );
      return (
        authorizationResponse(error) ??
        annualBalanceAdministrationErrorResponse(error) ??
        Response.json(
          { error: "Impor saldo cuti gagal.", code: "INTERNAL_ERROR" },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
