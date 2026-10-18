import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { ReportingService } from "@/application/reporting/service";
import {
  ReportError,
  checksum,
  type ReportSession,
  type ReportRepository,
  type Run,
  type Artifact,
  type Audit,
  type Dataset,
} from "@/application/reporting/contracts";
import { reportRow } from "./reporting";
export function reportingFixture() {
  let now = new Date("2026-12-31T17:00:00.000Z");
  const a = {
      userId: randomUUID(),
      employeeId: randomUUID(),
      fullName: "Admin Sintetis",
      role: "ADMIN_KEPEGAWAIAN" as const,
    },
    b = { ...a, userId: randomUUID() },
    employee = { ...a, userId: randomUUID(), role: "PEGAWAI" as const };
  let runs: Run[] = [],
    artifacts: Artifact[] = [],
    commands: {
      actor: string;
      key: string;
      runId: string;
      format: string;
      artifactId: string;
    }[] = [],
    events: Audit[] = [];
  const storage = new Map<string, Uint8Array>();
  const flags = {
    active: true,
    auditFailure: "",
    readerFailure: false,
    writeFailure: false,
    renderFailure: false,
  };
  const s: ReportSession = {
    activeAdmin: async () => flags.active,
    retry: async (actor, key) =>
      runs.find((r) => r.actorUserId === actor && r.idempotencyKey === key) ??
      null,
    run: async (id) => runs.find((r) => r.id === id) ?? null,
    insertRun: async (r) => {
      runs.push(r);
    },
    artifact: async (id) => artifacts.find((r) => r.id === id) ?? null,
    format: async (runId, format) =>
      artifacts.find((r) => r.runId === runId && r.format === format) ?? null,
    exportRetry: async (actor, key) =>
      commands.find((c) => c.actor === actor && c.key === key) ?? null,
    exportRequest: async (actor, key, runId, format, artifactId) => {
      commands.push({ actor, key, runId, format, artifactId });
    },
    insertArtifact: async (r) => {
      artifacts.push(r);
    },
    audit: async (e) => {
      if (flags.auditFailure === "all" || flags.auditFailure === e.event)
        throw new ReportError(503, "AUDIT_UNAVAILABLE", "Audit gagal.");
      events.push(e);
    },
  };
  const repo: ReportRepository = {
    withActor: async (_, work) => {
      const backup = [...runs],
        arts = [...artifacts],
        cmd = [...commands],
        audit = [...events];
      try {
        return await work(s);
      } catch (e) {
        runs = backup;
        artifacts = arts;
        commands = cmd;
        events = audit;
        throw e;
      }
    },
    audit: (e) => s.audit(e),
  };
  const rows = [reportRow(), reportRow()];
  rows[1].employeeId = rows[0].employeeId;
  const reader = {
    read: vi.fn(async () => {
      if (flags.readerFailure)
        throw new ReportError(503, "QUERY_UNAVAILABLE", "Timeout.");
      return { capturedAt: now, rows };
    }),
  };
  const files = {
    put: vi.fn(async (bytes: Uint8Array) => {
      if (flags.writeFailure) throw Error("disk");
      const key = randomUUID().replaceAll("-", "");
      storage.set(key, new Uint8Array(bytes));
      return { key, size: bytes.length, checksum: checksum(bytes) };
    }),
    read: vi.fn(async (key: string) => {
      const v = storage.get(key);
      if (!v) throw Error("missing");
      return new Uint8Array(v);
    }),
    delete: vi.fn(async (key) => {
      storage.delete(key);
    }),
  };
  const renderers = {
    render: vi.fn(async (_format: unknown, d: Dataset) => {
      if (flags.renderFailure) throw Error("renderer");
      return Buffer.from(JSON.stringify(d));
    }),
  };
  const service = new ReportingService(
    repo,
    reader,
    files,
    renderers,
    "test-key-".repeat(8),
    () => now,
  );
  return {
    a,
    b,
    employee,
    flags,
    reader,
    files,
    renderers,
    repo,
    service,
    rows,
    storage,
    now: () => now,
    setNow: (d: Date) => {
      now = d;
    },
    runs: () => runs,
    artifacts: () => artifacts,
    events: () => events,
  };
}
