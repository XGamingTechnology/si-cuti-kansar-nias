import {
  createDecisionHandler,
  createLegacyDecisionHandler,
} from "@/application/leave-records/delivery";
export const GET = createDecisionHandler();
export const POST = createLegacyDecisionHandler();
