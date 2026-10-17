import {
  requireRequestPrincipal,
  authorizationResponse,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { DashboardError } from "./contracts";
import { overlayYear } from "./overlay";
import { createDashboardRuntime } from "@/infrastructure/dashboard/runtime";
export type DashboardResource =
  | "summary"
  | "calendar"
  | "agenda"
  | "employees"
  | "balance"
  | "overlays"
  | "overlay-history"
  | "overlay-preview"
  | "overlay-publish";
export function createDashboardHandler(
  resource: DashboardResource,
  factory = createDashboardRuntime,
) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const params = new URL(request.url).searchParams;
      let result: unknown;
      if (resource === "overlay-preview" || resource === "overlay-publish") {
        requireAdmin(actor);
        const body = await boundedJSON(request);
        result =
          resource === "overlay-preview"
            ? await runtime.overlays.preview(actor, body)
            : { version: await runtime.overlays.publish(actor, body) };
      } else if (resource === "overlays")
        result = await runtime.overlays.read(actor, overlayYear(params));
      else if (resource === "overlay-history")
        result = await runtime.overlays.history(actor, params);
      else if (resource === "employees")
        result = await runtime.dashboard.employees(actor, params);
      else if (resource === "balance") {
        if ([...params.keys()].length)
          throw new DashboardError(
            422,
            "Saldo hanya untuk pemilik sesi dan tahun berjalan.",
          );
        result = await runtime.dashboard.balance(actor);
      } else result = await runtime.dashboard.read(actor, resource, params);
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        (error instanceof DashboardError
          ? Response.json({ error: error.message }, { status: error.status })
          : Response.json(
              { error: "Data dashboard/kalender gagal diproses." },
              { status: 500 },
            ))
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

async function boundedJSON(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 300000)
    throw new DashboardError(422, "Dataset terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) throw new DashboardError(422, "JSON tidak valid.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 300000) {
        await reader.cancel();
        throw new DashboardError(422, "Dataset terlalu besar.");
      }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    throw new DashboardError(422, "JSON tidak valid.");
  }
}
