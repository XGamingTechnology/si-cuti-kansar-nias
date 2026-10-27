import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaJointLeaveRepository } from "@/infrastructure/joint-leave/prisma-repository";
import { JointLeaveService } from "@/application/joint-leave/service";
import type {
  JointLeaveRepository,
  PolicyInput,
  ReviewInput,
  SubmitInput,
} from "@/application/joint-leave/ports";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { AnnualBalanceMutationService } from "@/application/leave-balance/service";
import { AnnualRolloverService } from "@/application/leave-balance/rollover-service";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";
import type { Principal } from "@/modules/auth/service";

const run =
  process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1" && process.env.DATABASE_URL
    ? describe
    : describe.skip;
run("Joint Leave on disposable PostgreSQL", () => {
  const db = createDatabaseClient(),
    repo = new PrismaJointLeaveRepository(db),
    employees: string[] = [],
    policies: string[] = [];
  let root: string, storage: LocalPrivateStorage, bytes: Uint8Array;
  let now = new Date("2099-04-10T00:00:00Z");
  const service = () => new JointLeaveService(repo, storage, () => now);
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "si-cuti-joint-"));
    storage = new LocalPrivateStorage(root);
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    bytes = await pdf.save();
  });
  afterEach(async () => {
    const employeeId = { in: employees };
    await db.jointLeaveClaimDate.deleteMany({ where: { employeeId } });
    await db.jointLeaveClaim.deleteMany({ where: { employeeId } });
    await db.annualBalanceOperation.deleteMany({ where: { employeeId } });
    await db.annualRolloverCommit.deleteMany({ where: { employeeId } });
    await db.n2QualifyingPeriod.deleteMany({ where: { employeeId } });
    await db.annualBalanceAccount.deleteMany({ where: { employeeId } });
    await db.jointLeaveEvent.deleteMany({
      where: { policyId: { in: policies } },
    });
    await db.jointLeavePolicy.deleteMany({ where: { id: { in: policies } } });
    await db.user.deleteMany({ where: { employeeId } });
    await db.employee.deleteMany({ where: { id: employeeId } });
    employees.length = 0;
    policies.length = 0;
    now = new Date("2099-04-10T00:00:00Z");
  });
  afterAll(async () => {
    await db.$disconnect();
    await rm(root, { recursive: true, force: true });
  });
  async function actor(role: Principal["role"] = "PEGAWAI") {
    const e = await db.employee.create({
      data: {
        nip: "JLC-" + randomUUID().slice(0, 26),
        fullName: "Pegawai Klaim Sintetis",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
      },
    });
    employees.push(e.id);
    const u = await db.user.create({ data: { employeeId: e.id, role } });
    return {
      userId: u.id,
      employeeId: e.id,
      role,
      fullName: e.fullName,
    } satisfies Principal;
  }
  async function accounts(owner: Principal, year = 2099) {
    await db.annualBalanceAccount.createMany({
      data: (["JOINT_LEAVE_CLAIM", "N2", "N1", "N"] as const).map((bucket) => ({
        employeeId: owner.employeeId,
        entitlementYear: year,
        bucket,
        grantedDays: bucket === "N" ? 12 : 0,
      })),
    });
  }
  async function fixture(quotaDays = 3) {
    const owner = await actor(),
      admin = await actor("ADMIN_KEPEGAWAIAN");
    await accounts(owner);
    const input: PolicyInput = {
      name: "Pengaturan Uji " + randomUUID(),
      creditYear: 2099,
      quotaDays,
      sourceReference: "DASAR UJI SINTETIS",
      events: [
        { date: "2099-01-03", name: "Tanggal Uji A", kind: "REGULAR" },
        { date: "2099-01-04", name: "Tanggal Uji B", kind: "REGULAR" },
        { date: "2098-12-27", name: "Natal Uji", kind: "YEAR_END" },
      ],
    };
    const policy = await service().configure(admin, input, randomUUID());
    policies.push(policy.id);
    const inputFor = (
      ids = policy.eventDates.map((e) => e.id),
    ): SubmitInput => ({
      policyId: policy.id,
      eventIds: ids,
      assignmentType: "OPERATIONS",
      title: "Penugasan Sintetis",
      sprinNumber: null,
      idempotencyKey: randomUUID(),
    });
    const submit = (input = inputFor()) =>
      service().submit(owner, input, { bytes, mime: "application/pdf" });
    return { owner, admin, policy, input, inputFor, submit };
  }
  async function decision(
    admin: Principal,
    id: string,
    approvedEventIds: string[],
    reason = "Bukti diperiksa untuk uji sintetis",
  ) {
    const input: ReviewInput = {
      approvedEventIds,
      reason,
      evidenceVerified: approvedEventIds.length > 0,
      idempotencyKey: randomUUID(),
      fingerprint: "",
    };
    const p = await service().preview(admin, id, input);
    return { ...input, fingerprint: p.fingerprint };
  }
  async function credit(owner: Principal) {
    return (
      await db.annualBalanceAccount.findUniqueOrThrow({
        where: {
          employeeId_entitlementYear_bucket: {
            employeeId: owner.employeeId,
            entitlementYear: 2099,
            bucket: "JOINT_LEAVE_CLAIM",
          },
        },
      })
    ).grantedDays;
  }
  it.each([
    "SPRIN_ASSIGNMENT",
    "SPECIAL_STANDBY",
    "OPERATIONS",
    "REGULAR_STANDBY",
  ] as const)(
    "persists/reviews %s without requiring Sprin metadata",
    async (assignmentType) => {
      const f = await fixture();
      const c = await f.submit({ ...f.inputFor(), assignmentType });
      expect((await service().get(f.owner, c.id)).assignmentType).toBe(
        assignmentType,
      );
      expect((await service().get(f.owner, c.id)).sprinNumber).toBeNull();
      await expect(
        f.submit({ ...f.inputFor(), assignmentType }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const input = await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      );
      await service().review(f.admin, c.id, input);
      expect(await credit(f.owner)).toBe(3);
      expect((await service().get(f.admin, c.id)).assignmentType).toBe(
        assignmentType,
      );
    },
  );
  it("pins immutable policy/evidence; partial decision, GRANT links, fresh counters and same-key replay agree", async () => {
    const f = await fixture(),
      c = await f.submit();
    const before = await db.jointLeaveClaim.findUniqueOrThrow({
      where: { id: c.id },
    });
    const newer = await service().configure(
      f.admin,
      { ...f.input, name: "Prospektif " + randomUUID() },
      randomUUID(),
    );
    policies.push(newer.id);
    expect(
      (
        await db.jointLeavePolicy.findUniqueOrThrow({
          where: { id: f.policy.id },
        })
      ).isActive,
    ).toBe(false);
    await expect(f.submit()).rejects.toMatchObject({ code: "UNSUPPORTED" });
    const input = await decision(f.admin, c.id, [
      c.dates[0].eventId,
      c.dates[1].eventId,
    ]);
    const saved = await service().review(f.admin, c.id, input);
    expect(saved.status).toBe("APPROVED");
    expect(saved.dates.map((d) => d.status).sort()).toEqual([
      "APPROVED",
      "APPROVED",
      "REJECTED",
    ]);
    expect(await credit(f.owner)).toBe(2);
    const operations = await db.annualBalanceOperation.findMany({
      where: { employeeId: f.owner.employeeId },
    });
    expect(operations).toHaveLength(2);
    expect(
      operations.every(
        (o) =>
          o.referenceId === c.id &&
          o.referenceType === "JOINT_LEAVE_CLAIM" &&
          o.days === 1 &&
          o.bucket === "JOINT_LEAVE_CLAIM",
      ),
    ).toBe(true);
    expect(
      saved.dates
        .filter((d) => d.status === "APPROVED")
        .every((d) => operations.some((o) => o.id === d.operationId)),
    ).toBe(true);
    expect((await service().review(f.admin, c.id, input)).id).toBe(c.id);
    expect(await credit(f.owner)).toBe(2);
    const after = await db.jointLeaveClaim.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(after.policySnapshot).toEqual(before.policySnapshot);
    expect(after.evidenceChecksum).toBe(before.evidenceChecksum);
    expect(after.submittedAt).toEqual(before.submittedAt);
    await db.employee.update({
      where: { id: f.owner.employeeId },
      data: { fullName: "Nama sintetis diubah" },
    });
    expect((await service().get(f.owner, c.id)).employeeName).toBe(
      c.employeeName,
    );
    expect(after.reviewedByUserId).toBe(f.admin.userId);
    expect(after.reviewSnapshot).toMatchObject({
      approvedDays: 2,
      previouslyApproved: 0,
      evidenceVerified: true,
    });
    await expect(
      service().review(f.admin, c.id, { ...input, reason: "Berubah" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("serializes concurrent same-payload submission retries and independent duplicate-date requests", async () => {
    const f = await fixture(),
      input = f.inputFor([f.policy.eventDates[0].id]);
    const retry = await Promise.all([f.submit(input), f.submit(input)]);
    expect(retry[0].id).toBe(retry[1].id);
    expect(
      await db.jointLeaveClaim.count({
        where: { employeeId: f.owner.employeeId },
      }),
    ).toBe(1);
    const second = f.inputFor([f.policy.eventDates[1].id]);
    const outcomes = await Promise.allSettled([
      f.submit(second),
      f.submit({ ...second, idempotencyKey: randomUUID() }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await service().duplicates(f.owner, [f.policy.eventDates[0].date]),
    ).toEqual([f.policy.eventDates[0].date]);
  });
  it("rejection frees the date for a new claim but retains the original reason/evidence", async () => {
    const f = await fixture(),
      input = f.inputFor([f.policy.eventDates[0].id]),
      c = await f.submit(input);
    await service().review(
      f.admin,
      c.id,
      await decision(f.admin, c.id, [], "Bukti perlu diperbaiki"),
    );
    expect(await credit(f.owner)).toBe(0);
    expect(
      await service().duplicates(f.owner, [f.policy.eventDates[0].date]),
    ).toEqual([]);
    const newer = await f.submit({
      ...input,
      idempotencyKey: randomUUID(),
      title: "Bukti diperbaiki",
    });
    expect(newer.id).not.toBe(c.id);
    expect(
      await db.jointLeaveClaim.count({
        where: { employeeId: f.owner.employeeId },
      }),
    ).toBe(2);
    expect((await service().get(f.owner, c.id)).reason).toBe(
      "Bukti perlu diperbaiki",
    );
  });
  it("database uniqueness blocks the same date across different policies and credit years", async () => {
    const f = await fixture(),
      c = await f.submit(f.inputFor([f.policy.eventDates[0].id]));
    const newer = await service().configure(
      f.admin,
      { ...f.input, name: "Versi lain " + randomUUID() },
      randomUUID(),
    );
    policies.push(newer.id);
    const event = newer.eventDates.find(
      (e) => e.date === f.policy.eventDates[0].date,
    )!;
    await expect(
      f.submit({ ...f.inputFor([event.id]), policyId: newer.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const otherYear = await service().configure(
      f.admin,
      {
        name: "Tahun lain " + randomUUID(),
        creditYear: 2098,
        quotaDays: 1,
        sourceReference: "DASAR UJI",
        events: [
          {
            date: c.dates[0].eventDate,
            name: "Tanggal sama tahun lain",
            kind: "REGULAR",
          },
        ],
      },
      randomUUID(),
    );
    policies.push(otherYear.id);
    now = new Date("2098-12-28T00:00:00Z");
    await expect(
      f.submit({
        ...f.inputFor([otherYear.eventDates[0].id]),
        policyId: otherYear.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    now = new Date("2099-04-10T00:00:00Z");
    const other = await f.submit({
      ...f.inputFor([newer.eventDates[1].id]),
      policyId: newer.id,
    });
    await expect(
      db.jointLeaveClaimDate.update({
        where: { id: other.dates[0].id },
        data: {
          eventId: event.id,
          eventDate: new Date(c.dates[0].eventDate + "T00:00:00Z"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("quota counts lifetime approved dates across policy versions, even after the balance is spent", async () => {
    const f = await fixture(1),
      c = await f.submit(f.inputFor([f.policy.eventDates[0].id]));
    await service().review(
      f.admin,
      c.id,
      await decision(f.admin, c.id, [c.dates[0].eventId]),
    );
    const balance = new AnnualBalanceMutationService(
      new PrismaAnnualBalanceRepository(db),
    );
    const mutation = {
      employeeId: f.owner.employeeId,
      entitlementYear: 2099,
      occurredAt: now,
      reference: { referenceType: "JLC_TEST", referenceId: randomUUID() },
      idempotencyKey: randomUUID(),
    };
    await balance.reserveAnnualLeave({ ...mutation, requestedDays: 1 });
    await balance.commitAnnualLeave({
      ...mutation,
      idempotencyKey: randomUUID(),
    });
    const p = await service().configure(
      f.admin,
      { ...f.input, name: "Versi Kuota " + randomUUID() },
      randomUUID(),
    );
    policies.push(p.id);
    const event = p.eventDates.find((e) => e.date !== c.dates[0].eventDate)!;
    const next = await f.submit({ ...f.inputFor([event.id]), policyId: p.id });
    await expect(decision(f.admin, next.id, [event.id])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await credit(f.owner)).toBe(1);
  });
  it("two concurrent approvals cannot consume the last quota twice", async () => {
    const f = await fixture(1),
      a = await f.submit(f.inputFor([f.policy.eventDates[0].id])),
      b = await f.submit(f.inputFor([f.policy.eventDates[1].id]));
    const ai = await decision(f.admin, a.id, [a.dates[0].eventId]),
      bi = await decision(f.admin, b.id, [b.dates[0].eventId]);
    const result = await Promise.allSettled([
      service().review(f.admin, a.id, ai),
      service().review(f.admin, b.id, bi),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await credit(f.owner)).toBe(1);
    expect(
      await db.annualBalanceOperation.count({
        where: {
          employeeId: f.owner.employeeId,
          referenceType: "JOINT_LEAVE_CLAIM",
        },
      }),
    ).toBe(1);
  });
  it("owner isolation protects metadata, list and bytes; preview does not write", async () => {
    const f = await fixture(),
      other = await actor(),
      c = await f.submit();
    await expect(service().get(other, c.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service().evidence(other, c.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await service().list(other, { year: 2099, page: 1, search: "" })).claims,
    ).toEqual([]);
    await decision(
      f.admin,
      c.id,
      c.dates.map((d) => d.eventId),
    );
    expect(await credit(f.owner)).toBe(0);
    expect(
      await db.annualBalanceOperation.count({
        where: { employeeId: f.owner.employeeId },
      }),
    ).toBe(0);
    expect(
      Buffer.from((await service().evidence(f.owner, c.id)).bytes),
    ).toEqual(Buffer.from(bytes));
  });
  it("rolls back GRANT, counters and date decisions if the audit decision write fails", async () => {
    const f = await fixture(),
      c = await f.submit(),
      input = await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      );
    const failing: JointLeaveRepository = {
      policies: repo.policies.bind(repo),
      createPolicy: repo.createPolicy.bind(repo),
      list: repo.list.bind(repo),
      claim: repo.claim.bind(repo),
      retry: repo.retry.bind(repo),
      blockingDates: repo.blockingDates.bind(repo),
      withEmployee: (id, work) =>
        repo.withEmployee(id, (tx) =>
          work(
            new Proxy(tx, {
              get(target, key, receiver) {
                if (key === "decide")
                  return async () => {
                    throw Error("forced review failure");
                  };
                const v = Reflect.get(target, key, receiver);
                return typeof v === "function" ? v.bind(target) : v;
              },
            }),
          ),
        ),
    };
    await expect(
      new JointLeaveService(failing, storage, () => now).review(
        f.admin,
        c.id,
        input,
      ),
    ).rejects.toThrow("forced review failure");
    expect(await credit(f.owner)).toBe(0);
    expect(
      await db.annualBalanceOperation.count({
        where: { employeeId: f.owner.employeeId },
      }),
    ).toBe(0);
    expect(
      (await service().get(f.owner, c.id)).dates.every(
        (d) => d.status === "PENDING" && d.operationId === null,
      ),
    ).toBe(true);
  });
  it("stale preview rejects a changed account, then a fresh preview succeeds", async () => {
    const f = await fixture(),
      c = await f.submit(),
      input = await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      );
    const balance = new AnnualBalanceMutationService(
      new PrismaAnnualBalanceRepository(db),
    );
    await balance.reserveAnnualLeave({
      employeeId: f.owner.employeeId,
      entitlementYear: 2099,
      occurredAt: now,
      reference: { referenceType: "JLC_RACE", referenceId: randomUUID() },
      idempotencyKey: randomUUID(),
      requestedDays: 1,
    });
    await expect(service().review(f.admin, c.id, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await credit(f.owner)).toBe(0);
    await service().review(
      f.admin,
      c.id,
      await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      ),
    );
    expect(await credit(f.owner)).toBe(3);
  });
  it("expired claims are not credited; rollover starts Claim at zero and retains original counters/history", async () => {
    const f = await fixture(),
      c = await f.submit(),
      input = await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      );
    await service().review(f.admin, c.id, input);
    expect(await credit(f.owner)).toBe(3);
    await accounts(f.owner, 2098);
    now = new Date("2099-12-31T17:00:00Z");
    const result = await new AnnualRolloverService(
      new PrismaAnnualBalanceRepository(db),
    ).commitAnnualRollover({
      employeeId: f.owner.employeeId,
      targetYear: 2100,
      idempotencyKey: randomUUID(),
      committedAt: now,
    });
    expect(
      result.targetYearAccounts.find((a) => a.bucket === "JOINT_LEAVE_CLAIM")
        ?.availableDays,
    ).toBe(0);
    expect(await credit(f.owner)).toBe(3);
    expect((await service().review(f.admin, c.id, input)).id).toBe(c.id);
    await expect(f.submit()).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
  it("does not grant on uninitialized balances or a year already feeding downstream rollover", async () => {
    const f = await fixture(),
      c = await f.submit();
    await db.annualBalanceAccount.deleteMany({
      where: { employeeId: f.owner.employeeId },
    });
    await expect(
      decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await accounts(f.owner);
    await db.annualRolloverCommit.create({
      data: {
        employeeId: f.owner.employeeId,
        targetYear: 2100,
        idempotencyKey: randomUUID(),
        committedAt: now,
      },
    });
    await expect(
      decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(await credit(f.owner)).toBe(0);
  });
  it("policy commands are actor/payload bound and private metadata omits storage keys", async () => {
    const f = await fixture(),
      key = randomUUID(),
      input = { ...f.input, name: "Replay " + randomUUID() };
    const a = await service().configure(f.admin, input, key);
    policies.push(a.id);
    expect((await service().configure(f.admin, input, key)).id).toBe(a.id);
    await expect(
      service().configure(f.admin, { ...input, quotaDays: 2 }, key),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const c = await f.submit({
      ...f.inputFor(a.eventDates.map((e) => e.id)),
      policyId: a.id,
    });
    expect(c).not.toHaveProperty("evidenceKey");
    expect(c).not.toHaveProperty("payloadHash");
  });
  it("approval waits for the shared Employee lock and observes a concurrently committed rollover", async () => {
    const f = await fixture(),
      c = await f.submit(),
      input = await decision(
        f.admin,
        c.id,
        c.dates.map((d) => d.eventId),
      );
    let acquired!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      }),
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    const rollover = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id"=${f.owner.employeeId}::uuid FOR UPDATE`;
      acquired();
      await held;
      await tx.annualRolloverCommit.create({
        data: {
          employeeId: f.owner.employeeId,
          targetYear: 2100,
          idempotencyKey: randomUUID(),
          committedAt: now,
        },
      });
    });
    await ready;
    const approval = service().review(f.admin, c.id, input);
    release();
    await rollover;
    await expect(approval).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(await credit(f.owner)).toBe(0);
  });
});
