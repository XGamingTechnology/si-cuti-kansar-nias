import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMonth,
} from "@/components/indonesian-date";

describe("tanggal UI Indonesia", () => {
  it.each(["Pacific/Honolulu", "Pacific/Kiritimati", "Asia/Jakarta"])(
    "date-only tidak bergeser di %s",
    (zone) => {
      const previous = process.env.TZ;
      try {
        process.env.TZ = zone;
        expect(formatDate("2026-10-15")).toBe("15 Oktober 2026");
        expect(formatDate("2026-01-01")).toBe("1 Januari 2026");
        expect(formatMonth("2026-10")).toBe("Oktober 2026");
      } finally {
        process.env.TZ = previous;
      }
    },
  );
  it("timestamp melewati tengah malam menurut WIB", () => {
    expect(formatDateTime("2026-12-31T16:59:00Z")).toBe(
      "31 Desember 2026 pukul 23.59 WIB",
    );
    expect(formatDateTime("2026-12-31T17:00:00Z")).toBe(
      "1 Januari 2027 pukul 00.00 WIB",
    );
  });
});
