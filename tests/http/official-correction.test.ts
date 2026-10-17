import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createOfficialCorrectionHandlers } from "@/app/api/admin/leave-authorized-officials/[id]/corrections/route";
import { OfficialCorrectionService } from "@/application/leave-authorized-official/correction";
import { LeaveAuthorizedOfficialError } from "@/application/leave-authorized-official/service";
const id = randomUUID();
const admin = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};
const body = () => ({
  expectedRevision: 0,
  idempotencyKey: randomUUID(),
  changes: { fullName: "Koreksi" },
  reason: "Alasan",
  sourceReference: "SK-UJI",
  confirmed: true,
});
const request = (method: string, value = body()) =>
  new Request("http://localhost/api/test", {
    method,
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
      "x-user-id": "forged",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(value) }),
  });
const context = { params: Promise.resolve({ id }) };
describe("official correction HTTP", () => {
  function runtime(principal: unknown = admin, error?: Error) {
    const repository = {
      history: vi.fn(async () => ({ assignment: { id }, corrections: [] })),
      correct: vi.fn(async (..._args: unknown[]) => {
        void _args;
        if (error) throw error;
        return { id };
      }),
    };
    const deps = {
      authentication: { validate: vi.fn(async () => principal) },
      officialCorrections: new OfficialCorrectionService(repository as never),
      database: { $disconnect: vi.fn() },
    };
    return {
      repository,
      deps,
      handlers: createOfficialCorrectionHandlers(() => deps as never),
    };
  }
  it.each([null, { ...admin, role: "PEGAWAI" }])(
    "denies read/write before parsing for %j",
    async (p) => {
      const { handlers, repository } = runtime(p);
      for (const method of ["GET", "POST"] as const)
        expect((await handlers[method](request(method), context)).status).toBe(
          p ? 403 : 401,
        );
      expect(repository.correct).not.toHaveBeenCalled();
      expect(repository.history).not.toHaveBeenCalled();
    },
  );
  it("serves Admin history no-store and uses session actor on writes", async () => {
    const { handlers, repository, deps } = runtime();
    expect(
      (await handlers.GET(request("GET"), context)).headers.get(
        "cache-control",
      ),
    ).toBe("no-store");
    expect((await handlers.POST(request("POST"), context)).status).toBe(200);
    expect(repository.correct.mock.calls[0][1]).toBe(admin.userId);
    expect(deps.database.$disconnect).toHaveBeenCalledTimes(2);
  });
  it("rejects unknown fields and invalid IDs", async () => {
    const { handlers } = runtime();
    expect(
      (
        await handlers.POST(
          request("POST", { ...body(), actorUserId: "forged" } as never),
          context,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handlers.GET(request("GET"), {
          params: Promise.resolve({ id: "bad" }),
        })
      ).status,
    ).toBe(422);
  });
  it.each(["CONFLICT", "OVERLAP", "NOT_FOUND"] as const)(
    "maps %s safely",
    async (code) => {
      const { handlers } = runtime(
        admin,
        new LeaveAuthorizedOfficialError(code, "Pesan aman"),
      );
      expect((await handlers.POST(request("POST"), context)).status).toBe(
        code === "NOT_FOUND" ? 404 : 409,
      );
    },
  );
  it("does not leak adapter error details", async () => {
    const { handlers } = runtime(admin, new Error("secret database internals"));
    const response = await handlers.POST(request("POST"), context);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
