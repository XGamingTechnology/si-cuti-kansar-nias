import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "@/config/env";

describe("server environment", () => {
  it("rejects a non-PostgreSQL database URL", () => {
    expect(() => parseServerEnvironment({ DATABASE_URL: "https://example.test", PRIVATE_STORAGE_PATH: "/private" })).toThrow();
  });
});
