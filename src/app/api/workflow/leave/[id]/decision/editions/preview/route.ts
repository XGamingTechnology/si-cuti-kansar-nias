import {
  createDecisionEditionPreviewHandler,
  createDecisionSourcePagesHandler,
} from "@/application/leave-records/delivery";
export const POST = createDecisionEditionPreviewHandler();
export const GET = createDecisionSourcePagesHandler();
