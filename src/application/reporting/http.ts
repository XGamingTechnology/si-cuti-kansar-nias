import {
  requireRequestPrincipal,
  authorizationResponse,
  type SessionValidator,
} from "@/application/authorization/http";
import { ReportError } from "./contracts";
import type { ReportActor } from "./contracts";
import type { ReportingService } from "./service";
import { createReportingRuntime } from "@/infrastructure/reporting/runtime";
type Runtime = {
  authentication: SessionValidator;
  reporting: ReportingService;
  database: { $disconnect(): Promise<void> };
};
type Context = { params: Promise<{ id?: string; artifactId?: string }> };
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ReportError(422, "INVALID_JSON", "JSON tidak valid.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const n = await reader.read();
      if (n.done) break;
      size += n.value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new ReportError(422, "INVALID_JSON", "Permintaan terlalu besar.");
      }
      chunks.push(n.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) {
    if (e instanceof ReportError) throw e;
    throw new ReportError(422, "INVALID_JSON", "JSON tidak valid.");
  }
}
export function createReportHandler(
  resource: "create" | "read" | "export" | "download",
  factory: () => Runtime = createReportingRuntime,
) {
  return async (
    request: Request,
    context: Context = { params: Promise.resolve({}) },
  ) => {
    let runtime: Runtime | undefined;
    let actor: ReportActor | undefined;
    let dispatched = false;
    try {
      runtime = factory();
      actor = await requireRequestPrincipal(request, runtime.authentication);
      const params = await context.params;
      if (
        actor.role === "ADMIN_KEPEGAWAIAN" &&
        resource !== "read" &&
        [...new URL(request.url).searchParams.keys()].length
      )
        throw new ReportError(
          422,
          "INVALID_FILTER",
          "Parameter query tidak didukung pada operasi ini.",
        );
      // Non-admin denial is audited by the application before any body parsing or object lookup.
      const payload =
        actor.role === "ADMIN_KEPEGAWAIAN" &&
        (resource === "create" || resource === "export")
          ? await body(request)
          : undefined;
      dispatched = true;
      let result: unknown;
      if (resource === "create")
        result = await runtime.reporting.create(actor, payload);
      else if (resource === "read")
        result = await runtime.reporting.read(
          actor,
          params.id ?? "",
          new URL(request.url).searchParams,
        );
      else if (resource === "export")
        result = await runtime.reporting.export(
          actor,
          params.id ?? "",
          payload,
        );
      else {
        const file = await runtime.reporting.download(
          actor,
          params.id ?? "",
          params.artifactId ?? "",
        );
        // Session revocation/demotion during IO must not serve a buffer after authorization changed.
        const fresh = await requireRequestPrincipal(
          request,
          runtime.authentication,
        );
        if (fresh.userId !== actor.userId || fresh.role !== "ADMIN_KEPEGAWAIAN")
          return Response.json(
            { error: "Akses ditolak." },
            { status: 403, headers: { "Cache-Control": "private, no-store" } },
          );
        return new Response(new Uint8Array(file.bytes), {
          headers: {
            "Content-Type":
              file.format === "PDF"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${file.filename}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Report-Served-At": new Date().toISOString(),
          },
        });
      }
      return Response.json(result, {
        status: resource === "create" ? 201 : 200,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      if (actor && runtime && !dispatched && e instanceof ReportError) {
        try {
          await runtime.reporting.reject(actor, e);
        } catch (rejected) {
          e = rejected;
        }
      }
      const auth = authorizationResponse(e);
      if (auth) {
        auth.headers.set("Cache-Control", "private, no-store");
        return auth;
      }
      return Response.json(
        {
          error:
            e instanceof ReportError
              ? e.message
              : "Laporan tidak tersedia. Coba lagi.",
          code: e instanceof ReportError ? e.code : "REPORT_UNAVAILABLE",
        },
        {
          status: e instanceof ReportError ? e.status : 503,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    } finally {
      await runtime?.database.$disconnect();
    }
  };
}
