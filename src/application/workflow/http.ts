import { randomUUID } from "node:crypto";
import { authorizationResponse } from "@/application/authorization/http";
import {
  LEAVE_TYPES,
  WorkflowError,
  type LeaveRevisionContent,
  type PermissionRevisionContent,
} from "./types";

const statusByCode = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ILLEGAL_TRANSITION: 409,
  CONFLICT: 409,
  UNSUPPORTED_POLICY: 422,
} as const;

export function workflowErrorResponse(error: unknown) {
  const authorization = authorizationResponse(error);
  if (authorization) return authorization;
  if (!(error instanceof WorkflowError)) return null;
  return Response.json(
    { error: error.message, code: error.code },
    { status: statusByCode[error.code] },
  );
}

async function objectBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new WorkflowError("VALIDATION", "Data pengajuan tidak valid.");
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function leaveInput(
  request: Request,
): Promise<LeaveRevisionContent> {
  const body = await objectBody(request);
  const leaveType = text(body.leaveType);
  if (!LEAVE_TYPES.includes(leaveType as LeaveRevisionContent["leaveType"]))
    throw new WorkflowError("VALIDATION", "Jenis cuti tidak valid.");
  return {
    leaveType: leaveType as LeaveRevisionContent["leaveType"],
    startDate: text(body.startDate),
    endDate: text(body.endDate),
    reason: text(body.reason),
  };
}

export async function permissionInput(
  request: Request,
): Promise<PermissionRevisionContent> {
  const body = await objectBody(request);
  return {
    permissionTypeId: text(body.permissionTypeId),
    startDate: text(body.startDate),
    endDate: text(body.endDate),
    reason: text(body.reason),
  };
}

export async function actionInput(request: Request) {
  const body = await objectBody(request);
  const action = text(body.action);
  if (!["SUBMIT", "CANCEL", "RETURN", "REJECT", "APPROVE"].includes(action))
    throw new WorkflowError("VALIDATION", "Tindakan tidak valid.");
  return {
    action: action as "SUBMIT" | "CANCEL" | "RETURN" | "REJECT" | "APPROVE",
    reason: text(body.reason),
    evidenceReference: text(body.evidenceReference),
    idempotencyKey: randomUUID(),
  };
}
