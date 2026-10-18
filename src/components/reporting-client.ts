export type ReportOperation =
  | "create"
  | "preview"
  | "export"
  | "artifact"
  | "handoff";
const labels: Record<ReportOperation, string> = {
  create: "Membuat pratinjau",
  preview: "Memuat halaman pratinjau",
  export: "Menyiapkan ekspor",
  artifact: "Mengambil berkas",
  handoff: "Membuka unduhan browser",
};
export class ReportClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly operation: ReportOperation,
  ) {
    super(`${labels[operation]}: ${message}`);
  }
}
async function response(
  path: string,
  operation: ReportOperation,
  init?: RequestInit,
) {
  try {
    return await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
    });
  } catch {
    throw new ReportClientError(
      "koneksi terputus. Coba lagi; permintaan yang sama memakai kunci retry yang sama.",
      "NETWORK_ERROR",
      operation,
    );
  }
}
async function failure(
  r: Response,
  operation: ReportOperation,
): Promise<never> {
  let data: { error?: string; code?: string } = {};
  try {
    if (r.headers.get("content-type")?.includes("application/json")) {
      const parsed = await r.json();
      if (parsed && typeof parsed === "object") data = parsed;
    }
  } catch {
    /* Broken/non-JSON response never becomes a raw browser error. */
  }
  throw new ReportClientError(
    r.status === 401
      ? "sesi berakhir. Masuk kembali sebelum mencoba lagi."
      : r.status === 403
        ? "akses ditolak. Periksa akun dan hak akses Anda."
        : typeof data.error === "string"
          ? data.error
          : `server tidak dapat melayani permintaan (HTTP ${r.status}).`,
    r.status === 401
      ? "SESSION_EXPIRED"
      : typeof data.code === "string"
        ? data.code
        : "REPORT_UNAVAILABLE",
    operation,
  );
}
export async function reportJSON(
  path: string,
  operation: ReportOperation,
  init?: RequestInit,
) {
  const r = await response(path, operation, init);
  if (!r.ok) return failure(r, operation);
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new ReportClientError(
      "respons server bukan data laporan. Periksa sesi lalu coba lagi.",
      "INVALID_RESPONSE",
      operation,
    );
  try {
    return await r.json();
  } catch {
    throw new ReportClientError(
      "respons server tidak lengkap. Coba lagi.",
      "INVALID_RESPONSE",
      operation,
    );
  }
}
export async function reportBlob(path: string, format: "PDF" | "XLSX") {
  const operation = "artifact",
    r = await response(path, operation);
  if (!r.ok) return failure(r, operation);
  const mime =
    format === "PDF"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (r.headers.get("content-type")?.split(";")[0] !== mime)
    throw new ReportClientError(
      "respons bukan berkas yang diminta. Periksa sesi lalu coba lagi.",
      "INVALID_RESPONSE",
      operation,
    );
  let blob: Blob;
  try {
    blob = await r.blob();
  } catch {
    throw new ReportClientError(
      "transfer berkas terputus. Coba lagi.",
      "NETWORK_ERROR",
      operation,
    );
  }
  if (!blob.size)
    throw new ReportClientError(
      "berkas kosong. Coba lagi.",
      "INVALID_RESPONSE",
      operation,
    );
  return { blob, servedAt: r.headers.get("X-Report-Served-At") };
}
export function handoffReportDownload(blob: Blob, filename: string) {
  let url: string | undefined, anchor: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(blob);
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    // Attached anchor and a longer lease support browsers that hand off asynchronously.
    document.body.append(anchor);
    anchor.click();
  } catch {
    throw new ReportClientError(
      "browser belum dapat membuka unduhan. Coba lagi.",
      "DOWNLOAD_HANDOFF_FAILED",
      "handoff",
    );
  } finally {
    anchor?.remove();
    if (url) {
      const lease = url;
      setTimeout(() => URL.revokeObjectURL(lease), 60_000);
    }
  }
}
