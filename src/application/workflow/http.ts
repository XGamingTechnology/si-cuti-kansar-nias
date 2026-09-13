import { randomUUID } from "node:crypto";
import { authorizationResponse } from "@/application/authorization/http";
import { BalanceMutationError } from "@/application/leave-balance/service";
import { LeaveBalancePolicyError } from "@/domain/leave-balance/errors";
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

const balanceMutationResponseByCode = {
  VALIDATION: {
    status: 400,
    message: "Data saldo cuti tahunan tidak valid.",
  },
  NOT_FOUND: {
    status: 404,
    message: "Saldo cuti tahunan tidak ditemukan.",
  },
  CONFLICT: {
    status: 409,
    message:
      "Kondisi saldo cuti tahunan bertentangan dengan tindakan ini atau telah berubah.",
  },
  INVARIANT: {
    status: 409,
    message:
      "Saldo cuti tahunan belum siap untuk pengajuan ini. Hubungi Admin Kepegawaian.",
  },
} as const;

const balancePolicyResponseByCode = {
  VALIDATION: {
    status: 400,
    message: "Data saldo cuti tahunan tidak valid.",
  },
  INSUFFICIENT_BALANCE: {
    status: 422,
    message: "Saldo cuti tahunan tidak mencukupi untuk pengajuan ini.",
  },
  DUPLICATE_CALENDAR_DATE: {
    status: 409,
    message: "Konfigurasi kalender cuti tahunan memiliki tanggal yang sama.",
  },
  EXCESSIVE_RESTORATION: {
    status: 422,
    message: "Pemulihan saldo cuti tahunan tidak valid.",
  },
} as const;

export function workflowErrorResponse(error: unknown) {
  const authorization = authorizationResponse(error);
  if (authorization) return authorization;
  if (error instanceof WorkflowError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: statusByCode[error.code] },
    );
  }
  if (error instanceof BalanceMutationError) {
    const response = balanceMutationResponseByCode[error.code];
    return Response.json(
      {
        error: response.message,
        code: `BALANCE_MUTATION_${error.code}`,
      },
      { status: response.status },
    );
  }
  if (error instanceof LeaveBalancePolicyError) {
    const response = balancePolicyResponseByCode[error.code];
    return Response.json(
      {
        error: response.message,
        code: `LEAVE_BALANCE_POLICY_${error.code}`,
      },
      { status: response.status },
    );
  }
  return null;
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
    formPlace: text(body.formPlace) || null,
    leaveAddress: text(body.leaveAddress) || null,
    leavePhone: text(body.leavePhone) || null,
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
