import { requireRequestPrincipal } from "@/application/authorization/http";
import { workflowErrorResponse } from "@/application/workflow/http";
import {
  generateLeaveDocument,
  type LeaveDocumentVariant,
} from "@/application/workflow/leave-document";
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
    const rawVariant = url.searchParams.get("variant") ?? "proof";
    if (rawVariant !== "proof" && rawVariant !== "approved")
      return Response.json(
        { error: "Variant dokumen tidak valid." },
        { status: 400 },
      );

    const variant = rawVariant as LeaveDocumentVariant;
    // This single aggregate is the source for every request/revision field in the
    // form. Do not load a revision separately: it could race with a resubmission.
    const leave = await runtime.leave.get(actor, id);

    if (!leave.currentRevision.submittedAt)
      return Response.json(
        { error: "Formulir hanya tersedia setelah pengajuan dikirim." },
        { status: 409 },
      );

    const annualBalances =
      leave.currentRevision.leaveType === "ANNUAL"
        ? await Promise.all(
            (["N", "N1", "N2"] as const).map(async (bucket) => {
              const [account, reservations] = await Promise.all([
                runtime.database.annualBalanceAccount.findUnique({
                  where: {
                    employeeId_entitlementYear_bucket: {
                      employeeId: leave.employeeId,
                      entitlementYear: Number(
                        leave.currentRevision.startDate.slice(0, 4),
                      ),
                      bucket,
                    },
                  },
                }),
                runtime.database.annualBalanceOperation.aggregate({
                  where: {
                    referenceType: "LEAVE_REQUEST_REVISION",
                    referenceId: leave.currentRevision.id,
                    bucket,
                    operationType: "RESERVE",
                  },
                  _sum: { days: true },
                }),
              ]);
              return account
                ? {
                    bucket,
                    remainingDays:
                      account.grantedDays -
                      account.reservedDays -
                      account.committedDays,
                    allocatedDays: reservations._sum.days ?? undefined,
                  }
                : null;
            }),
          ).then((values) => values.filter((value) => value !== null))
        : undefined;
    const configuredName = process.env.OFFICE_HEAD_NAME?.trim();
    const configuredNip = process.env.OFFICE_HEAD_NIP?.trim();
    const pdf = generateLeaveDocument(leave, [], variant, undefined, {
      annualBalances,
      authorizedOfficial:
        configuredName && configuredNip
          ? { fullName: configuredName, nip: configuredNip }
          : null,
    });
    const filename = `formulir-pengajuan-cuti-${leave.employee.nip}-${id.slice(0, 8)}.pdf`;
    const disposition =
      url.searchParams.get("download") === "1" ? "attachment" : "inline";

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
