import { z } from "zod";
import {
  requireRequestPrincipal,
  authorizationResponse,
} from "@/application/authorization/http";
import { createAvatarRuntime } from "@/infrastructure/avatar/runtime";
import { AVATAR_INPUT_LIMIT, AvatarError } from "./contracts";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
async function body(request: Request, max: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
          await reader.cancel();
          throw new AvatarError(
            413,
            "AVATAR_SIZE",
            max ? "Foto maksimal 5 MiB." : "Hapus foto tidak menerima payload.",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks);
}
export function avatarHandler(
  operation: "metadata" | "image" | "upload" | "delete",
  factory = createAvatarRuntime,
) {
  return async (request: Request) => {
    let runtime: ReturnType<typeof factory> | undefined;
    try {
      runtime = factory();
      const actor = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const url = new URL(request.url),
        params = url.searchParams;
      if (operation === "image") {
        if (
          [...params.keys()].join(",") !== "v" ||
          !/^\d{1,9}$/.test(params.get("v") ?? "")
        )
          throw new AvatarError(422, "AVATAR_QUERY", "Versi foto tidak valid.");
      } else if (params.size)
        throw new AvatarError(
          422,
          "AVATAR_QUERY",
          "Endpoint foto sendiri tidak menerima identitas/path/filter.",
        );
      if (operation === "metadata")
        return Response.json(await runtime.avatars.get(actor), { headers });
      if (operation === "image") {
        const image = await runtime.avatars.image(
          actor,
          Number(params.get("v")),
        );
        await requireRequestPrincipal(request, runtime.authentication);
        return new Response(new Uint8Array(image.bytes), {
          headers: {
            ...headers,
            "Content-Type": image.mime,
            "Content-Length": String(image.bytes.byteLength),
            "Content-Disposition": "inline",
          },
        });
      }
      // Custom retry/version headers plus same-origin check prevent cross-origin form writes.
      const origin = request.headers.get("origin");
      // Next may expose its internal http://localhost URL behind TLS termination.
      // Compare the browser Origin to the actual Host preserved by our proxy, never
      // client-supplied X-Forwarded-Host; browser cross-origin writes still fail.
      let originAllowed = !origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          originAllowed =
            parsed.origin === origin &&
            ["http:", "https:"].includes(parsed.protocol) &&
            parsed.host.toLowerCase() ===
              (request.headers.get("host") ?? url.host).toLowerCase();
        } catch {
          originAllowed = false;
        }
      }
      if (
        !originAllowed ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new AvatarError(
          403,
          "FORBIDDEN",
          "Asal permintaan tidak diizinkan.",
        );
      const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
      const match = /^"(0|[1-9]\d{0,8})"$/.exec(
        request.headers.get("if-match") ?? "",
      );
      if (!key.success || !match)
        throw new AvatarError(
          422,
          "AVATAR_VERSION",
          "Kunci retry dan versi foto wajib valid.",
        );
      const mime = request.headers.get("content-type") ?? "";
      if (
        operation === "upload" &&
        mime !== "image/jpeg" &&
        mime !== "image/png"
      )
        throw new AvatarError(415, "AVATAR_FORMAT", "Gunakan JPEG atau PNG.");
      const bytes = await body(
        request,
        operation === "upload" ? AVATAR_INPUT_LIMIT : 0,
      );
      return Response.json(
        await runtime.avatars.change(
          actor,
          Number(match[1]),
          key.data,
          operation === "upload" ? { bytes, mime } : undefined,
        ),
        { headers },
      );
    } catch (e) {
      const auth = authorizationResponse(e);
      if (auth) {
        for (const [k, v] of Object.entries(headers)) auth.headers.set(k, v);
        return auth;
      }
      return Response.json(
        {
          error:
            e instanceof AvatarError
              ? e.message
              : "Foto belum dapat diproses. Foto lama tetap berlaku bila perubahan belum tersimpan; muat ulang untuk memastikan.",
          code: e instanceof AvatarError ? e.code : "AVATAR_UNAVAILABLE",
        },
        { status: e instanceof AvatarError ? e.status : 503, headers },
      );
    } finally {
      await runtime?.database.$disconnect();
    }
  };
}
