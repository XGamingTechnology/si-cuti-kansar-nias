import { requireRequestPrincipal } from "@/application/authorization/http";
import { workflowErrorResponse } from "@/application/workflow/http";
import { createWorkflowRuntime } from "@/infrastructure/workflow/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const runtime = createWorkflowRuntime();

  try {
    const actor = await requireRequestPrincipal(
      request,
      runtime.authentication,
    );

    const id = (await context.params).id;
    const url = new URL(request.url);
    const variant = url.searchParams.get("variant") ?? "proof";

    if (variant !== "proof")
      return Response.json(
        {
          error:
            "Hanya formulir pengajuan yang dibekukan saat submit yang tersedia dari endpoint ini.",
        },
        { status: 400 },
      );

    // Load the workflow aggregate only for authorization and revision identity.
    // PDF bytes themselves must never be regenerated from live master data.
    const leave = await runtime.leave.get(actor, id);

    if (!leave.currentRevision.submittedAt)
      return Response.json(
        { error: "Formulir hanya tersedia setelah pengajuan dikirim." },
        { status: 409 },
      );

    const stored = await runtime.leaveSubmissionProof.read(
      leave.currentRevision.id,
    );

    if (!stored)
      return Response.json(
        {
          error:
            "Formulir pengajuan yang dibekukan belum tersedia untuk revisi ini.",
        },
        { status: 409 },
      );

    const filename =
      "formulir-pengajuan-cuti-" +
      leave.employee.nip +
      "-" +
      id.slice(0, 8) +
      ".pdf";

    const disposition =
      url.searchParams.get("download") === "1" ? "attachment" : "inline";

    const body = new ArrayBuffer(stored.content.byteLength);
    new Uint8Array(body).set(stored.content);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": stored.record.mimeType,
        "content-disposition": disposition + '; filename="' + filename + '"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return (
      workflowErrorResponse(error) ??
      Response.json({ error: "Dokumen cuti gagal dibaca." }, { status: 500 })
    );
  } finally {
    await runtime.database.$disconnect();
  }
}
