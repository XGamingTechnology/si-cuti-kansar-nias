import {
  requireRequestPrincipal,
  authorizationResponse,
  type SessionValidator,
} from "@/application/authorization/http";
import { requireAdmin, requireRole } from "@/application/authorization/policy";
import type { JointLeaveService } from "./service";
import type {
  ClaimStatus,
  PolicyInput,
  ReviewInput,
  SubmitInput,
} from "./ports";
import { JointLeaveError, currentYear } from "./rules";
import { z } from "zod";
import { createJointLeaveRuntime } from "@/infrastructure/joint-leave/runtime";

type Runtime = {
  database: { $disconnect: () => Promise<void> };
  authentication: SessionValidator;
  jointLeave: JointLeaveService;
};
type Factory = () => Runtime;
type Context = { params?: Promise<{ id?: string }> };
type Action =
  | "claims"
  | "policies"
  | "duplicates"
  | "detail"
  | "evidence"
  | "preview"
  | "review";
const headers = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
async function boundedBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw new JointLeaveError("VALIDATION", "Permintaan terlalu besar.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts, total);
}
async function body(request: Request) {
  try {
    const b = JSON.parse(
      Buffer.from(await boundedBytes(request, 1024 * 1024)).toString("utf8"),
    );
    if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    return b;
  } catch {
    throw new JointLeaveError("VALIDATION", "Data permintaan tidak valid.");
  }
}
const submitSchema = z
  .object({
    policyId: z.string().uuid(),
    eventIds: z.array(z.string().uuid()).min(1).max(366),
    assignmentType: z.enum([
      "SPECIAL_STANDBY",
      "OPERATIONS",
      "REGULAR_STANDBY",
      "SPRIN_ASSIGNMENT",
    ]),
    title: z.string().max(300),
    sprinNumber: z.string().max(200).nullable(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
const reviewSchema = z
  .object({
    approvedEventIds: z.array(z.string().uuid()).max(366),
    reason: z.string().max(3000),
    evidenceVerified: z.boolean(),
    idempotencyKey: z.string().uuid(),
    fingerprint: z.string().max(64),
  })
  .strict();
const policySchema = z
  .object({
    name: z.string().max(200),
    creditYear: z.number().int(),
    quotaDays: z.number().int(),
    sourceReference: z.string().max(500),
    events: z
      .array(
        z
          .object({
            date: z.string(),
            name: z.string().max(200),
            kind: z.enum(["REGULAR", "YEAR_END"]),
          })
          .strict(),
      )
      .min(1)
      .max(366),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new JointLeaveError(
      "VALIDATION",
      "Data permintaan tidak valid. Periksa tanggal, jenis dan kolom wajib.",
    );
  return r.data;
}
export function createJointLeaveHandler(
  action: Action,
  factory: Factory = createJointLeaveRuntime,
) {
  return async (request: Request, context?: Context) => {
    const runtime = factory();
    try {
      const actor = await requireRequestPrincipal(
          request,
          runtime.authentication,
        ),
        service = runtime.jointLeave;
      const url = new URL(request.url),
        id = (await context?.params)?.id ?? "";
      if (
        ["preview", "review"].includes(action) ||
        (action === "policies" && request.method === "POST")
      )
        requireAdmin(actor);
      if (
        action === "duplicates" ||
        (action === "claims" && request.method === "POST")
      )
        requireRole(actor, "PEGAWAI");
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > 11 * 1024 * 1024)
        throw new JointLeaveError("VALIDATION", "Permintaan terlalu besar.");
      let result: unknown;
      if (action === "claims" && request.method === "GET")
        result = await service.list(actor, {
          page: Number(url.searchParams.get("page") ?? 1),
          year: Number(url.searchParams.get("year") ?? currentYear(new Date())),
          status: (url.searchParams.get("status") || undefined) as
            | ClaimStatus
            | undefined,
          search: url.searchParams.get("search") ?? "",
        });
      else if (action === "claims" && request.method === "POST") {
        let form: FormData;
        try {
          form = await new Response(
            Buffer.from(await boundedBytes(request, 11 * 1024 * 1024)),
            {
              headers: {
                "content-type": request.headers.get("content-type") ?? "",
              },
            },
          ).formData();
        } catch {
          throw new JointLeaveError(
            "VALIDATION",
            "Formulir/unggahan tidak valid.",
          );
        }
        const file = form.get("evidence");
        if (!(file instanceof File))
          throw new JointLeaveError("VALIDATION", "Unggah bukti penugasan.");
        if (file.size > 10 * 1024 * 1024)
          throw new JointLeaveError("VALIDATION", "Bukti maksimal 10 MB.");
        let data: SubmitInput;
        try {
          data = parse(submitSchema, JSON.parse(String(form.get("data"))));
          if (!data || typeof data !== "object") throw Error();
        } catch {
          throw new JointLeaveError(
            "VALIDATION",
            "Data pengajuan tidak valid.",
          );
        }
        result = {
          claim: await service.submit(actor, data, {
            bytes: new Uint8Array(await file.arrayBuffer()),
            mime: file.type,
          }),
        };
      } else if (action === "policies")
        result =
          request.method === "GET"
            ? {
                policies: await service.policies(
                  actor,
                  Number(
                    url.searchParams.get("year") ?? currentYear(new Date()),
                  ),
                ),
              }
            : {
                policy: await service.configure(
                  actor,
                  parse(policySchema, await body(request)) as PolicyInput,
                  request.headers.get("idempotency-key") ?? "",
                ),
              };
      else if (action === "duplicates")
        result = {
          dates: await service.duplicates(
            actor,
            (url.searchParams.get("dates") ?? "").split(",").filter(Boolean),
          ),
        };
      else if (action === "detail")
        result = { claim: await service.get(actor, id) };
      else if (action === "preview")
        result = {
          preview: await service.preview(
            actor,
            id,
            parse(reviewSchema, await body(request)) as ReviewInput,
          ),
        };
      else if (action === "review")
        result = {
          claim: await service.review(
            actor,
            id,
            parse(reviewSchema, await body(request)) as ReviewInput,
          ),
        };
      else if (action === "evidence") {
        const evidence = await service.evidence(actor, id);
        const extension =
          evidence.mime === "application/pdf"
            ? "pdf"
            : evidence.mime === "image/png"
              ? "png"
              : "jpg";
        return new Response(Buffer.from(evidence.bytes), {
          headers: {
            ...headers,
            "content-type": evidence.mime,
            "content-disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="bukti-klaim.${extension}"`,
            "content-security-policy": "sandbox; default-src 'none'",
          },
        });
      }
      return Response.json(result, { headers });
    } catch (error) {
      const auth = authorizationResponse(error);
      if (auth) return auth;
      if (error instanceof JointLeaveError)
        return Response.json(
          { error: error.message },
          {
            status: {
              VALIDATION: 400,
              NOT_FOUND: 404,
              CONFLICT: 409,
              UNSUPPORTED: 422,
            }[error.code],
            headers,
          },
        );
      return Response.json(
        { error: "Klaim cuti bersama gagal diproses." },
        { status: 500, headers },
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
