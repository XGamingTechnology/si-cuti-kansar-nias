import { requireRequestPrincipal } from "@/application/authorization/http";
import { workflowErrorResponse } from "@/application/workflow/http";
import {
  requireWorkflowAdmin,
  WorkflowError,
} from "@/application/workflow/types";
import { LeaveDocumentError } from "@/application/leave-documents/service";
import {
  createLeaveDocumentRuntime,
  type LeaveDocumentRuntime,
} from "@/infrastructure/leave-documents/runtime";
import { PDFDocument } from "pdf-lib";
import type { ReturnInput } from "./ports";

type Context = { params: Promise<{ id: string }> };
type Factory = () => LeaveDocumentRuntime;
type Actor = Awaited<ReturnType<typeof requireRequestPrincipal>>;
function run(
  operation: (
    runtime: LeaveDocumentRuntime,
    actor: Actor,
    request: Request,
    id: string,
  ) => Promise<Response>,
  factory: Factory,
) {
  return async (request: Request, context: Context) => {
    const runtime = factory();
    try {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const { id } = await context.params;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new WorkflowError("VALIDATION", "ID pengajuan tidak valid.");
      await runtime.leave.get(actor, id);
      return await operation(runtime, actor, request, id);
    } catch (error) {
      if (error instanceof LeaveDocumentError)
        return Response.json(
          { error: error.message },
          {
            status:
              error.code === "VALIDATION"
                ? 400
                : error.code === "NOT_FOUND"
                  ? 404
                  : 409,
          },
        );
      return (
        workflowErrorResponse(error) ??
        Response.json(
          { error: "Operasi arsip atau pengembalian cuti gagal." },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
async function body(request: Request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new WorkflowError("VALIDATION", "Data pengembalian tidak valid.");
  }
}
function input(value: Record<string, unknown>): ReturnInput {
  const text = (name: string) =>
    typeof value[name] === "string" ? (value[name] as string) : "";
  return {
    restoredDays:
      typeof value.restoredDays === "number" ? value.restoredDays : NaN,
    reason: text("reason"),
    basisReference: text("basisReference"),
    basisDate: text("basisDate"),
    evidenceDocumentId: text("evidenceDocumentId"),
    unusedDaysConfirmed: value.unusedDaysConfirmed === true,
  };
}
export function createReturnHandlers(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return {
    GET: run(
      async (runtime, actor, _request, id) =>
        Response.json({
          returns: await runtime.records.returns(
            actor,
            await runtime.leave.get(actor, id),
          ),
        }),
      factory,
    ),
    POST: run(async (runtime, actor, request, id) => {
      requireWorkflowAdmin(actor);
      const value = await body(request);
      if (
        typeof value.idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value.idempotencyKey,
        )
      )
        throw new WorkflowError(
          "VALIDATION",
          "Idempotency key UUID wajib diisi.",
        );
      return Response.json(
        {
          return: await runtime.records.apply(
            actor,
            id,
            input(value),
            value.idempotencyKey,
            typeof value.fingerprint === "string" ? value.fingerprint : "",
            request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
          ),
        },
        { status: 201 },
      );
    }, factory),
  };
}
export function createReturnPreviewHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, request, id) => {
    requireWorkflowAdmin(actor);
    return Response.json({
      preview: await runtime.records.preview(
        actor,
        id,
        input(await body(request)),
      ),
    });
  }, factory);
}
export function createDecisionHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(
    async (runtime, actor, _request, id) =>
      Response.json({ decision: await runtime.records.decision(actor, id) }),
    factory,
  );
}
export function createLegacyDecisionHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, request, id) => {
    requireWorkflowAdmin(actor);
    const value = await body(request);
    const documentId =
      typeof value.documentId === "string" && value.documentId
        ? value.documentId
        : null;
    if (
      documentId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        documentId,
      )
    )
      throw new WorkflowError("VALIDATION", "ID scan tidak valid.");
    return Response.json({
      decision: await runtime.records.verifyLegacyDecision(
        actor,
        id,
        documentId,
        value.confirmed === true,
      ),
    });
  }, factory);
}
export function createDecisionDocumentHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, request, id) => {
    const editionId =
      new URL(request.url).searchParams.get("edition") ?? undefined;
    if (editionId && !/^[0-9a-f-]{36}$/i.test(editionId))
      throw new WorkflowError("VALIDATION", "ID edisi tidak valid.");
    const result = editionId
      ? await runtime.records.decisionDocument(actor, id, editionId)
      : await runtime.records.decisionDocument(actor, id);
    return new Response(Uint8Array.from(result.content).buffer, {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-disposition": `attachment; filename="${result.status === "APPROVED" ? "arsip-final-disetujui" : "hasil-penolakan"}-${result.id}.pdf"`,
      },
    });
  }, factory);
}
export function createReturnEvidenceHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, request, id) => {
    requireWorkflowAdmin(actor);
    const leave = await runtime.leave.get(actor, id);
    if (
      leave.status !== "APPROVED" ||
      leave.currentRevision.leaveType !== "ANNUAL"
    )
      throw new WorkflowError(
        "ILLEGAL_TRANSITION",
        "Bukti pengembalian hanya untuk Cuti Tahunan yang disetujui.",
      );
    const data = await request.formData();
    const file = data.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      throw new WorkflowError(
        "VALIDATION",
        "Bukti wajib berupa PDF maksimal 10 MB.",
      );
    const content = new Uint8Array(await file.arrayBuffer());
    try {
      const pdf = await PDFDocument.load(content);
      if (pdf.getPageCount() === 0) throw new Error();
    } catch {
      throw new WorkflowError(
        "VALIDATION",
        "Bukti bukan PDF yang dapat dibaca.",
      );
    }
    const document = await runtime.documents.uploadReturnEvidence({
      leaveRequestId: id,
      revisionId: leave.currentRevision.id,
      uploadedByUserId: actor.userId,
      originalFileName: file.name,
      mimeType: file.type,
      sourceIp: request.headers.get("x-real-ip")?.slice(0, 64) ?? null,
      content,
      snapshot: {
        purpose: "RETURN_BASIS",
        requestId: id,
        revisionId: leave.currentRevision.id,
        actorUserId: actor.userId,
      },
    });
    return Response.json({ document }, { status: 201 });
  }, factory);
}

export function createDecisionEditionHandlers(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return {
    POST: run(async (runtime, actor, request, id) => {
      requireWorkflowAdmin(actor);
      const value = await body(request);
      if (
        typeof value.idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value.idempotencyKey,
        )
      )
        throw new WorkflowError(
          "VALIDATION",
          "Kunci penyimpanan UUID wajib diisi.",
        );
      return Response.json(
        {
          edition: await runtime.records.saveDecisionEdition(
            actor,
            id,
            value.placement,
            typeof value.sourceChecksum === "string"
              ? value.sourceChecksum
              : "",
            value.idempotencyKey,
            value.confirmed === true,
            typeof value.previewFingerprint === "string"
              ? value.previewFingerprint
              : "",
          ),
        },
        { status: 201 },
      );
    }, factory),
  };
}
export function createDecisionEditionPreviewHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, request, id) => {
    requireWorkflowAdmin(actor);
    const value = await body(request);
    const result = await runtime.records.previewDecisionEdition(
      actor,
      id,
      value.placement,
      typeof value.sourceChecksum === "string" ? value.sourceChecksum : "",
    );
    return new Response(Uint8Array.from(result.content).buffer, {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-si-cuti-preview": result.fingerprint,
      },
    });
  }, factory);
}

export function createDecisionSourcePagesHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return run(async (runtime, actor, _request, id) => {
    requireWorkflowAdmin(actor);
    return Response.json(await runtime.records.decisionSourcePages(actor, id), {
      headers: { "cache-control": "private, no-store" },
    });
  }, factory);
}
