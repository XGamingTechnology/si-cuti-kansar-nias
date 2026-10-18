import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCalendarWeekend,
  shortCalendarName,
} from "@/components/calendar-presentation";
import {
  reportJSON,
  reportBlob,
  handoffReportDownload,
} from "@/components/reporting-client";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("calendar display (no entitlement inference)", () => {
  it("uses date-only weekday independently of viewer timezone and keeps short names recognisable", () => {
    expect(isCalendarWeekend("2026-01-03")).toBe(true);
    expect(isCalendarWeekend("2026-01-04")).toBe(true);
    expect(isCalendarWeekend("2026-01-05")).toBe(false);
    expect(shortCalendarName("  Pegawai  Sintetis Panjang, S.E. ")).toBe(
      "Pegawai Sintetis",
    );
  });
});
describe("report client operation boundaries", () => {
  it.each(["create", "preview", "export"] as const)(
    "labels a real fetch rejection for %s without raw NetworkError",
    async (operation) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("NetworkError")),
      );
      await expect(
        reportJSON("/api/reports/runs", operation),
      ).rejects.toMatchObject({ code: "NETWORK_ERROR", operation });
      await expect(
        reportJSON("/api/reports/runs", operation),
      ).rejects.not.toThrow("NetworkError");
    },
  );
  it("rejects successful HTML and malformed JSON instead of reporting a successful operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html>Login</html>", {
            headers: { "content-type": "text/html" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("{", {
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    await expect(
      reportJSON("/api/reports/runs", "create"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", operation: "create" });
    await expect(
      reportJSON("/api/reports/runs", "export"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", operation: "export" });
  });
  it("explains session expiry on a non-JSON response and preserves fail-closed audit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("Login", { status: 401 }))
        .mockResolvedValueOnce(
          Response.json(
            { error: "Audit tidak tersedia", code: "AUDIT_UNAVAILABLE" },
            { status: 503 },
          ),
        ),
    );
    await expect(reportJSON("/x", "preview")).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
      message: expect.stringContaining("Masuk kembali"),
    });
    await expect(reportJSON("/x", "export")).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
      operation: "export",
    });
  });
  it("treats a null JSON error body as an operation failure without raw TypeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(null, { status: 502 })),
    );
    await expect(reportJSON("/x", "export")).rejects.toMatchObject({
      code: "REPORT_UNAVAILABLE",
      operation: "export",
      message: expect.stringContaining("HTTP 502"),
    });
  });
  it("rejects HTML/JSON masquerading as a binary file and empty bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html/>", { headers: { "content-type": "text/html" } }),
        )
        .mockResolvedValueOnce(
          new Response("", { headers: { "content-type": "application/pdf" } }),
        ),
    );
    await expect(reportBlob("/artifact", "PDF")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      operation: "artifact",
    });
    await expect(reportBlob("/artifact", "PDF")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("separates artifact HTTP denial from a broken transfer and never returns a partial blob", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ error: "Forbidden" }, { status: 403 }),
        )
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/pdf" }),
          blob: vi.fn().mockRejectedValue(new TypeError("NetworkError")),
        }),
    );
    await expect(reportBlob("/artifact", "PDF")).rejects.toMatchObject({
      operation: "artifact",
      message: expect.stringContaining("akses ditolak"),
    });
    await expect(reportBlob("/artifact", "PDF")).rejects.toMatchObject({
      operation: "artifact",
      code: "NETWORK_ERROR",
    });
  });
  it.each(["PDF", "XLSX"] as const)(
    "returns a complete authorised %s buffer without an additional unaudited fetch",
    async (format) => {
      const mime =
        format === "PDF"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const fetcher = vi.fn().mockResolvedValue(
        new Response("fixture", {
          headers: {
            "content-type": mime,
            "X-Report-Served-At": "2026-10-18T08:00:00Z",
          },
        }),
      );
      vi.stubGlobal("fetch", fetcher);
      const value = await reportBlob("/artifact", format);
      expect(await value.blob.text()).toBe("fixture");
      expect(value.servedAt).toBe("2026-10-18T08:00:00Z");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("attaches anchor before click, removes it and retains the blob URL for delayed handoff", () => {
    vi.useFakeTimers();
    let attached = false;
    const anchor = {
      href: "",
      download: "",
      hidden: false,
      click: vi.fn(() => expect(attached).toBe(true)),
      remove: vi.fn(() => (attached = false)),
    };
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { append: () => (attached = true) },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    handoffReportDownload(new Blob(["PDF"]), "fixture.pdf");
    expect(anchor.download).toBe("fixture.pdf");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59000);
    expect(revoke).toHaveBeenCalledWith("blob:fixture");
  });
  it("identifies browser handoff failure and still cleans up the URL", () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      createElement: () => ({
        click: () => {
          throw Error("blocked");
        },
        remove: vi.fn(),
      }),
      body: { append: vi.fn() },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    expect(() => handoffReportDownload(new Blob(["x"]), "x.pdf")).toThrow(
      "browser belum dapat",
    );
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:failed");
  });
});
