import { requireRequestPrincipal } from "@/application/authorization/http";
import { workflowErrorResponse } from "@/application/workflow/http";
import { generateLeaveDocument, type LeaveDocumentVariant } from "@/application/workflow/leave-document";
import { createWorkflowRuntime } from "@/infrastructure/workflow/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const runtime = createWorkflowRuntime();
  try {
    const actor = await requireRequestPrincipal(request, runtime.authentication);
    const id = (await context.params).id;
    const url = new URL(request.url);
    const rawVariant = url.searchParams.get("variant") ?? "proof";
    if (rawVariant !== "proof" && rawVariant !== "approved")
      return Response.json({ error: "Variant dokumen tidak valid." }, { status: 400 });

    const variant = rawVariant as LeaveDocumentVariant;
    const leave = await runtime.leave.get(actor, id);
    const history = await runtime.leave.history(actor, id);

    if (variant === "approved" && leave.status !== "APPROVED")
      return Response.json(
        { error: "Formulir persetujuan hanya tersedia setelah pengajuan disetujui." },
        { status: 409 },
      );

    const pdf = generateLeaveDocument(leave, history, variant);
    const filename =
      variant === "approved"
        ? `formulir-cuti-${leave.employee.nip}-${id.slice(0, 8)}.pdf`
        : `bukti-pengajuan-cuti-${leave.employee.nip}-${id.slice(0, 8)}.pdf`;
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return (
      workflowErrorResponse(error) ??
      Response.json({ error: "Dokumen cuti gagal dibuat." }, { status: 500 })
    );
  } finally {
    await runtime.database.$disconnect();
  }
}
