import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalReportFiles } from "./files";
export async function purgeReportFiles(
  files: LocalReportFiles,
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
) {
  await files.initialize(false);
  let scanned = 0,
    eligible = 0,
    deleted = 0,
    failed = 0,
    oldestMs = 0,
    overdue = 0,
    overdue48 = 0;
  for (const directory of await readdir(files.root)) {
    if (directory === ".si-cuti-m7-report-storage") continue;
    const dir = join(files.root, directory),
      ds = await lstat(dir);
    if (
      !/^[0-9a-f]{2}$/.test(directory) ||
      !ds.isDirectory() ||
      ds.isSymbolicLink()
    ) {
      failed++;
      continue;
    }
    for (const name of await readdir(dir)) {
      const path = join(dir, name);
      try {
        const st = await lstat(path);
        if (
          !st.isFile() ||
          st.isSymbolicLink() ||
          !new RegExp(
            `^${directory}[0-9a-f]{30}(\\.[0-9a-f-]{36}\\.tmp)?$`,
          ).test(name)
        ) {
          failed++;
          continue;
        }
        scanned++;
        const age = now.getTime() - st.mtimeMs;
        oldestMs = Math.max(oldestMs, age);
        if (age >= 36 * 3600000) overdue++;
        if (age >= 48 * 3600000) overdue48++;
        if (age >= 24 * 3600000) {
          eligible++;
          if (!dryRun) {
            await rm(path, { force: true });
            deleted++;
          }
        }
      } catch {
        failed++;
      }
    }
  }
  return {
    scanned,
    eligible,
    deleted,
    failed,
    oldestAgeHours: Math.round(oldestMs / 360000) / 10,
    overdue36h: overdue,
    overdue48h: overdue48,
    remainingEligible: eligible - deleted,
    dryRun,
    healthy: failed === 0 && (dryRun ? overdue === 0 : deleted === eligible),
  };
}
