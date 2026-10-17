import { randomUUID } from "node:crypto";
import {
  DEFINITION,
  RENDERER,
  type Dataset,
  type ReportRow,
  type Filters,
} from "@/application/reporting/contracts";
export const reportFilters = (extra: Partial<Filters> = {}): Filters => ({
  reportCode: "LEAVE_REQUESTS",
  from: "2026-12-30",
  to: "2027-01-03",
  status: "APPROVED",
  search: "",
  activeState: "all",
  ...extra,
});
export const reportRow = (extra: Partial<ReportRow> = {}): ReportRow => ({
  requestId: randomUUID(),
  revisionId: randomUUID(),
  revisionNumber: 2,
  employeeId: randomUUID(),
  nip: "001234567890123456",
  name: "Pegawai Sintetis",
  workUnit: "Unit Sintetis",
  active: true,
  typeCode: "ANNUAL",
  typeLabel: "Cuti Tahunan",
  startDate: "2026-12-29",
  endDate: "2027-01-05",
  status: "APPROVED",
  submittedAt: "2026-12-30T17:00:00.000Z",
  workingDays: 5,
  hasBalanceReturn: true,
  ...extra,
});
export const reportDataset = (
  rows = [reportRow()],
  filters = reportFilters(),
): Dataset => ({
  runId: randomUUID(),
  definitionVersion: DEFINITION,
  rendererVersion: RENDERER,
  capturedAt: "2026-12-31T17:00:00.000Z",
  filters,
  rows,
});
