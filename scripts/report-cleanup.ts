// Operational CLI only; never called by a web route. Bundle with esbuild (Docker target report-maintenance); run the resulting .mjs with Node 24.
import { LocalReportFiles } from "../src/infrastructure/reporting/files.ts";
import { purgeReportFiles } from "../src/infrastructure/reporting/cleanup.ts";
import pg from "pg";
async function main() {
  const mode = process.argv[2];
  if (mode === "files" || mode === "check") {
    const root = process.env.REPORT_STORAGE_PATH,
      docs = process.env.PRIVATE_STORAGE_PATH;
    if (!root || !docs)
      throw new Error(
        "REPORT_STORAGE_PATH dan PRIVATE_STORAGE_PATH wajib diisi.",
      );
    const report = await purgeReportFiles(new LocalReportFiles(root, docs), {
      dryRun: mode === "check",
    });
    process.stdout.write(JSON.stringify({ mode, ...report }) + "\n");
    if (!report.healthy) process.exitCode = 1;
    return;
  }
  if (mode === "audit") {
    const url = process.env.REPORT_MAINTENANCE_DATABASE_URL;
    if (!url)
      throw new Error(
        "REPORT_MAINTENANCE_DATABASE_URL khusus role maintenance wajib diisi.",
      );
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      query_timeout: 35000,
    });
    try {
      await client.connect();
      await client.query("SET statement_timeout='30s'");
      const r = await client.query(
        "SELECT public.m7_purge_report_audit() AS deleted",
      );
      process.stdout.write(
        JSON.stringify({ mode, deleted: r.rows[0].deleted }) + "\n",
      );
    } finally {
      await client.end();
    }
    return;
  }
  throw new Error("Gunakan: report-cleanup.ts files | check | audit");
}
main().catch(() => {
  process.stderr.write(
    '{"status":"failed","message":"Pembersihan laporan gagal; periksa job, akses dan backlog tanpa mencetak credential."}\n',
  );
  process.exitCode = 1;
});
