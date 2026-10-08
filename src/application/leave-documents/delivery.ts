import { requireRequestPrincipal } from "@/application/authorization/http";
import {
  LeaveDocumentError,
  type LeaveDocumentMetadata,
} from "@/application/leave-documents/service";
import { workflowErrorResponse } from "@/application/workflow/http";
import { requireWorkflowAdmin, WorkflowError } from "@/application/workflow/types";
import {
  createLeaveDocumentRuntime,
  type LeaveDocumentRuntime,
} from "@/infrastructure/leave-documents/runtime";

type Factory = () => LeaveDocumentRuntime;

function documentErrorResponse(error: unknown) {
  if (!(error instanceof LeaveDocumentError)) return null;
  const status =
    error.code === "VALIDATION" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
  return Response.json({ error: error.message, code: error.code }, { status });
}

function sourceIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  return (forwarded || direct || "").slice(0, 64) || null;
}

function fileNameForHeader(document: LeaveDocumentMetadata) {
  const candidate =
    document.originalFileName ||
    `formulir-cuti-bertanda-tangan-v${document.version}.pdf`;
  const ascii = candidate
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
  return ascii || `formulir-cuti-v${document.version}.pdf`;
}

function run(
  factory: Factory,
  operation: (
    runtime: LeaveDocumentRuntime,
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const runtime = factory();
    try {
      return await operation(runtime, request, context);
    } catch (error) {
      return (
        documentErrorResponse(error) ??
        workflowErrorResponse(error) ??
        Response.json(
          { error: "Operasi dokumen cuti gagal." },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export function createLeaveDocumentCollectionHandlers(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return {
    GET: run(factory, async (runtime, request, context) => {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const id = (await context.params).id;
      await runtime.leave.get(actor, id);
      return Response.json({
        documents: await runtime.documents.listForLeaveRequest(id),
      });
    }),

    POST: run(factory, async (runtime, request, context) => {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      requireWorkflowAdmin(actor);
      const id = (await context.params).id;
      const leave = await runtime.leave.get(actor, id);
      if (!leave.currentRevision.submittedAt)
        throw new WorkflowError(
          "ILLEGAL_TRANSITION",
          "Dokumen final hanya dapat diarsipkan setelah pengajuan dikirim.",
        );

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw new LeaveDocumentError(
          "VALIDATION",
          "Data unggahan tidak valid.",
        );
      }
      const value = form.get("file");
      if (!(value instanceof File))
        throw new LeaveDocumentError("VALIDATION", "File PDF wajib diunggah.");

      const content = new Uint8Array(await value.arrayBuffer());
      const document = await runtime.documents.uploadApprovedForm({
        leaveRequestId: leave.id,
        revisionId: leave.currentRevision.id,
        uploadedByUserId: actor.userId,
        originalFileName: value.name,
        mimeType: value.type,
        sourceIp: sourceIp(request),
        content,
        snapshot: {
          requestId: leave.id,
          requestStatusAtUpload: leave.status,
          revisionId: leave.currentRevision.id,
          revisionNumber: leave.currentRevision.revisionNumber,
          submittedAt: leave.currentRevision.submittedAt.toISOString(),
          employeeId: leave.employeeId,
          employeeNip: leave.employee.nip,
          leaveType: leave.currentRevision.leaveType,
        },
      });
      return Response.json({ document }, { status: 201 });
    }),
  };
}

export function createLeaveDocumentContentHandler(
  factory: Factory = createLeaveDocumentRuntime,
) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string; documentId: string }> },
  ) => {
    const runtime = factory();
    try {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const { id, documentId } = await context.params;
      await runtime.leave.get(actor, id);
      const { document, content } =
        await runtime.documents.readForLeaveRequest(id, documentId);
      const disposition =
        new URL(request.url).searchParams.get("download") === "1"
          ? "attachment"
          : "inline";
      const filename = fileNameForHeader(document);
      return new Response(content, {
        status: 200,
        headers: {
          "content-type": document.mimeType,
          "content-length": String(document.sizeBytes),
          "content-disposition": `${disposition}; filename="${filename}"`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      return (
        documentErrorResponse(error) ??
        workflowErrorResponse(error) ??
        Response.json(
          { error: "Dokumen cuti gagal dibuka." },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
