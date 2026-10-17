import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  requireAdmin,
  AuthorizationError,
} from "@/application/authorization/policy";
import {
  DEFINITION,
  RENDERER,
  MAX_DATASET,
  MAX_ARTIFACT,
  MAX_ROWS,
  ReportError,
  checksum,
  fingerprint,
  redact,
  summary,
  parseFilters,
  datasetSchema,
  exportSchema,
  createSchema,
  type Run,
  type Dataset,
  type ReportActor,
  type ReportSession,
  type ReportRepository,
  type ReportReader,
  type ReportFiles,
  type ReportRenderers,
  type Audit,
  type Filters,
  type Artifact,
} from "./contracts";
export class ReportingService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly reader: ReportReader,
    private readonly files: ReportFiles,
    private readonly renderers: ReportRenderers,
    private readonly secret: string,
    private readonly clock = () => new Date(),
  ) {
    if (secret.length < 32)
      throw new Error("REPORT_AUDIT_HASH_KEY minimal 32 karakter.");
  }
  private async authorize(s: ReportSession, a: ReportActor) {
    requireAdmin(a);
    if (!(await s.activeAdmin(a.userId)))
      throw new AuthorizationError(403, "Forbidden");
  }
  private async own(s: ReportSession, a: ReportActor, id: string) {
    await this.authorize(s, a);
    if (!z.uuid().safeParse(id).success)
      throw new ReportError(422, "INVALID_ID", "ID laporan tidak valid.");
    const run = await s.run(id);
    if (!run)
      throw new ReportError(404, "NOT_FOUND", "Laporan tidak ditemukan.");
    if (run.actorUserId !== a.userId)
      throw new AuthorizationError(403, "Forbidden");
    this.live(run);
    return run;
  }
  private live(r: Run) {
    if (this.clock().getTime() >= r.expiresAt.getTime())
      throw new ReportError(
        410,
        "REPORT_EXPIRED",
        "Laporan kedaluwarsa. Buat pratinjau baru.",
      );
    if (r.definitionVersion !== DEFINITION || r.rendererVersion !== RENDERER)
      throw new ReportError(
        409,
        "VERSION_UNAVAILABLE",
        "Versi laporan tidak didukung. Buat laporan baru.",
      );
  }
  private async data(r: Run): Promise<Dataset> {
    const bytes = await this.files.read(r.datasetKey, MAX_DATASET);
    if (bytes.length !== r.datasetSize || checksum(bytes) !== r.datasetChecksum)
      throw new ReportError(
        503,
        "DATASET_UNAVAILABLE",
        "Integritas snapshot laporan tidak dapat diverifikasi.",
      );
    const d = datasetSchema.safeParse(
      JSON.parse(Buffer.from(bytes).toString("utf8")),
    );
    if (
      !d.success ||
      d.data.runId !== r.id ||
      d.data.rows.length !== r.rowCount ||
      d.data.capturedAt !== r.capturedAt.toISOString() ||
      d.data.filters.reportCode !== r.reportCode
    )
      throw new ReportError(
        503,
        "DATASET_UNAVAILABLE",
        "Snapshot laporan tidak valid.",
      );
    return d.data;
  }
  private event(
    a: ReportActor,
    correlationId: string,
    event: string,
    run?: Run,
    filters?: Filters,
    extra: Partial<Audit> = {},
  ): Audit {
    return {
      actorUserId: a.userId,
      actorRole: a.role,
      occurredAt: this.clock(),
      correlationId,
      runId: run?.id ?? null,
      reportCode: run?.reportCode ?? filters?.reportCode ?? null,
      definitionVersion: DEFINITION,
      event,
      resultCode: "OK",
      format: null,
      rowCount: run?.rowCount ?? null,
      filters: run?.filters ?? redact(this.secret, filters),
      datasetChecksum: run?.datasetChecksum ?? null,
      artifactChecksum: null,
      ...extra,
    };
  }
  private async operation<T>(
    a: ReportActor,
    event: string,
    work: (s: ReportSession, id: string, journal: string[]) => Promise<T>,
    requestedRunId?: string,
    input?: unknown,
  ) {
    const correlationId = randomUUID(),
      journal: string[] = [];
    try {
      requireAdmin(a);
      return await this.repository.withActor(a.userId, async (s) => {
        await this.authorize(s, a);
        return work(s, correlationId, journal);
      });
    } catch (error) {
      // A rollback may leave bytes, never published metadata. Journal cleanup is best effort;
      // the dedicated bounded filesystem purger handles crashes and failed deletions too.
      await Promise.allSettled(journal.map((key) => this.files.delete(key)));
      const code =
        error instanceof ReportError
          ? error.code
          : error instanceof AuthorizationError
            ? "FORBIDDEN"
            : "REPORT_UNAVAILABLE";
      try {
        const parsed = createSchema.safeParse(input);
        const filters = parsed.success
          ? (({ idempotencyKey: _key, ...f }) => {
              void _key;
              return f;
            })(parsed.data)
          : undefined;
        await this.repository.audit(
          this.event(a, correlationId, `${event}_FAILED`, undefined, filters, {
            resultCode: code,
            runId:
              requestedRunId && z.uuid().safeParse(requestedRunId).success
                ? requestedRunId
                : null,
          }),
        );
      } catch {
        throw new ReportError(
          503,
          "AUDIT_UNAVAILABLE",
          "Audit laporan tidak tersedia. Hasil tidak dilayani; coba lagi.",
        );
      }
      if (error instanceof ReportError || error instanceof AuthorizationError)
        throw error;
      throw new ReportError(
        503,
        "REPORT_UNAVAILABLE",
        "Laporan gagal diproses. Coba lagi dengan permintaan yang sama.",
      );
    }
  }
  private async page(
    s: ReportSession,
    a: ReportActor,
    r: Run,
    d: Dataset,
    offset = 0,
    limit = 25,
  ) {
    await this.authorize(s, a);
    this.live(r);
    const cursor = (n: number) => {
      const body = Buffer.from(
        JSON.stringify({
          id: r.id,
          actor: a.userId,
          checksum: r.datasetChecksum,
          offset: n,
        }),
      ).toString("base64url");
      return `${body}.${fingerprint(this.secret, body)}`;
    };
    const artifacts = await Promise.all(
      (["PDF", "XLSX"] as const).map((f) => s.format(r.id, f)),
    );
    return {
      run: {
        id: r.id,
        reportCode: r.reportCode,
        definitionVersion: r.definitionVersion,
        rendererVersion: r.rendererVersion,
        capturedAt: r.capturedAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        filters: d.filters,
        rowCount: r.rowCount,
        datasetChecksum: r.datasetChecksum,
      },
      summary: summary(d.rows),
      items: d.rows.slice(offset, offset + limit),
      offset,
      limit,
      nextCursor:
        offset + limit < d.rows.length ? cursor(offset + limit) : null,
      artifacts: artifacts
        .filter((v): v is Artifact => Boolean(v))
        .map(this.artifactDTO),
    };
  }
  private artifactDTO(a: Artifact) {
    return {
      id: a.id,
      format: a.format,
      checksum: a.checksum,
      size: a.size,
      rendererVersion: a.rendererVersion,
    };
  }
  async reject(a: ReportActor, error: ReportError) {
    try {
      await this.repository.audit(
        this.event(a, randomUUID(), "REQUEST_REJECTED", undefined, undefined, {
          resultCode: error.code,
        }),
      );
    } catch {
      throw new ReportError(
        503,
        "AUDIT_UNAVAILABLE",
        "Audit laporan tidak tersedia. Hasil tidak dilayani.",
      );
    }
    throw error;
  }
  create(a: ReportActor, input: unknown) {
    return this.operation(
      a,
      "RUN",
      async (s, id, journal) => {
        const { filters, idempotencyKey } = parseFilters(input),
          hash = fingerprint(this.secret, { version: DEFINITION, filters });
        const retry = await s.retry(a.userId, idempotencyKey);
        if (retry) {
          if (retry.payloadHash !== hash)
            throw new ReportError(
              409,
              "RETRY_CONFLICT",
              "Kunci retry sudah dipakai untuk filter berbeda.",
            );
          const d = await this.dataChecked(retry);
          await s.audit(this.event(a, id, "PREVIEW_READ", retry));
          return this.page(s, a, retry, d);
        }
        await s.audit(this.event(a, id, "RUN_REQUESTED", undefined, filters));
        const { rows, capturedAt, filterLabels } =
          await this.reader.read(filters);
        if (rows.length > MAX_ROWS)
          throw new ReportError(
            422,
            "REPORT_TOO_LARGE",
            "Laporan melebihi 1.000 baris. Persempit filter.",
          );
        const createdAt = this.clock(),
          runId = randomUUID();
        const d = datasetSchema.parse({
          runId,
          definitionVersion: DEFINITION,
          rendererVersion: RENDERER,
          capturedAt: capturedAt.toISOString(),
          filters,
          rows,
          ...(filterLabels ? { filterLabels } : {}),
        });
        const bytes = Buffer.from(JSON.stringify(d));
        if (bytes.length > MAX_DATASET)
          throw new ReportError(
            422,
            "DATASET_TOO_LARGE",
            "Snapshot melebihi batas ukuran. Persempit filter.",
          );
        const stored = await this.files.put(bytes);
        journal.push(stored.key);
        await this.verifyStored(
          stored.key,
          bytes.length,
          checksum(bytes),
          MAX_DATASET,
        );
        if (stored.checksum !== checksum(bytes) || stored.size !== bytes.length)
          throw new ReportError(
            503,
            "STORAGE_UNAVAILABLE",
            "Snapshot belum tersimpan dengan benar.",
          );
        const run: Run = {
          id: runId,
          actorUserId: a.userId,
          idempotencyKey,
          payloadHash: hash,
          reportCode: filters.reportCode,
          definitionVersion: DEFINITION,
          rendererVersion: RENDERER,
          filters: redact(this.secret, filters),
          capturedAt,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 86400000),
          rowCount: rows.length,
          datasetKey: stored.key,
          datasetChecksum: stored.checksum,
          datasetSize: stored.size,
        };
        await this.authorize(s, a);
        this.live(run);
        await s.insertRun(run);
        await s.audit(this.event(a, id, "RUN_READY", run));
        return this.page(s, a, run, d);
      },
      undefined,
      input,
    );
  }
  private async dataChecked(r: Run) {
    this.live(r);
    return this.data(r);
  }
  read(a: ReportActor, runId: string, params: URLSearchParams) {
    return this.operation(
      a,
      "PREVIEW",
      async (s, id) => {
        const r = await this.own(s, a, runId),
          d = await this.data(r);
        if (
          [...params.keys()].some((k) => k !== "limit" && k !== "cursor") ||
          [...params.keys()].some((k) => params.getAll(k).length !== 1)
        )
          throw new ReportError(
            422,
            "INVALID_PAGE",
            "Halaman laporan tidak valid.",
          );
        const limit = Number(params.get("limit") ?? 25);
        let offset = 0;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          throw new ReportError(
            422,
            "INVALID_PAGE",
            "Batas halaman 1–100 baris.",
          );
        const cursor = params.get("cursor");
        if (cursor) {
          try {
            const [body, signature, ...rest] = cursor.split(".");
            if (
              cursor.length > 1500 ||
              rest.length ||
              fingerprint(this.secret, body) !== signature
            )
              throw Error();
            const c = JSON.parse(
              Buffer.from(body, "base64url").toString("utf8"),
            );
            if (
              c.id !== r.id ||
              c.actor !== a.userId ||
              c.checksum !== r.datasetChecksum ||
              !Number.isInteger(c.offset) ||
              c.offset < 0 ||
              c.offset >= r.rowCount
            )
              throw Error();
            offset = c.offset;
          } catch {
            throw new ReportError(
              422,
              "INVALID_CURSOR",
              "Cursor laporan tidak valid.",
            );
          }
        }
        await this.authorize(s, a);
        this.live(r);
        await s.audit(this.event(a, id, "PREVIEW_READ", r));
        return this.page(s, a, r, d, offset, limit);
      },
      runId,
    );
  }
  export(a: ReportActor, runId: string, input: unknown) {
    return this.operation(
      a,
      "EXPORT",
      async (s, id, journal) => {
        const r = await this.own(s, a, runId),
          p = exportSchema.safeParse(input);
        if (!p.success)
          throw new ReportError(
            422,
            "INVALID_FORMAT",
            "Format ekspor atau kunci retry tidak valid.",
          );
        const { format, idempotencyKey } = p.data,
          retry = await s.exportRetry(a.userId, idempotencyKey);
        if (retry && (retry.runId !== runId || retry.format !== format))
          throw new ReportError(
            409,
            "RETRY_CONFLICT",
            "Kunci retry dipakai untuk ekspor berbeda.",
          );
        await s.audit(
          this.event(a, id, "EXPORT_REQUESTED", r, undefined, { format }),
        );
        let artifact = await s.format(runId, format);
        if (!artifact) {
          const d = await this.data(r),
            started = Date.now();
          const bytes = await this.renderers.render(format, d);
          if (Date.now() - started > 20000)
            throw new ReportError(
              503,
              "RENDER_TIMEOUT",
              "Waktu render terlampaui. Persempit filter.",
            );
          if (bytes.length > MAX_ARTIFACT)
            throw new ReportError(
              422,
              "ARTIFACT_TOO_LARGE",
              "Berkas ekspor terlalu besar. Persempit filter.",
            );
          const stored = await this.files.put(bytes);
          journal.push(stored.key);
          await this.verifyStored(
            stored.key,
            bytes.length,
            checksum(bytes),
            MAX_ARTIFACT,
          );
          if (
            stored.size !== bytes.length ||
            stored.checksum !== checksum(bytes)
          )
            throw new ReportError(
              503,
              "STORAGE_UNAVAILABLE",
              "Berkas ekspor belum tersimpan dengan benar.",
            );
          await this.authorize(s, a);
          this.live(r);
          artifact = {
            id: randomUUID(),
            runId,
            actorUserId: a.userId,
            idempotencyKey,
            format,
            rendererVersion: r.rendererVersion,
            storageKey: stored.key,
            checksum: stored.checksum,
            size: stored.size,
            createdAt: this.clock(),
          };
          await s.insertArtifact(artifact);
        } else
          await this.verifyStored(
            artifact.storageKey,
            artifact.size,
            artifact.checksum,
            MAX_ARTIFACT,
          );
        if (!retry)
          await s.exportRequest(
            a.userId,
            idempotencyKey,
            runId,
            format,
            artifact.id,
          );
        await this.authorize(s, a);
        this.live(r);
        await s.audit(
          this.event(a, id, "EXPORT_READY", r, undefined, {
            format,
            artifactChecksum: artifact.checksum,
          }),
        );
        return {
          artifact: this.artifactDTO(artifact),
          runId: r.id,
          datasetChecksum: r.datasetChecksum,
        };
      },
      runId,
    );
  }
  private async verifyStored(
    key: string,
    size: number,
    hash: string,
    max: number,
  ) {
    const bytes = await this.files.read(key, max);
    if (bytes.length !== size || checksum(bytes) !== hash)
      throw new ReportError(
        503,
        "STORAGE_UNAVAILABLE",
        "Integritas berkas laporan tidak dapat diverifikasi.",
      );
    return bytes;
  }
  download(a: ReportActor, runId: string, artifactId: string) {
    return this.operation(
      a,
      "DOWNLOAD",
      async (s, id) => {
        const r = await this.own(s, a, runId);
        if (!z.uuid().safeParse(artifactId).success)
          throw new ReportError(422, "INVALID_ID", "ID artefak tidak valid.");
        const artifact = await s.artifact(artifactId);
        if (
          !artifact ||
          artifact.runId !== r.id ||
          artifact.actorUserId !== a.userId
        )
          throw new ReportError(
            404,
            "NOT_FOUND",
            "Berkas laporan tidak ditemukan.",
          );
        const bytes = await this.verifyStored(
          artifact.storageKey,
          artifact.size,
          artifact.checksum,
          MAX_ARTIFACT,
        );
        await this.authorize(s, a);
        this.live(r);
        await s.audit(
          this.event(a, id, "DOWNLOAD_AUTHORIZED", r, undefined, {
            format: artifact.format,
            artifactChecksum: artifact.checksum,
          }),
        );
        return {
          bytes,
          format: artifact.format,
          filename: `si-cuti-${r.reportCode.toLowerCase()}-${r.id}.${artifact.format.toLowerCase()}`,
        };
      },
      runId,
    );
  }
}
