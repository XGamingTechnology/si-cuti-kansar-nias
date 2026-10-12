import { createDetailHandlers } from "@/application/workflow/delivery";
const handlers = createDetailHandlers("permission");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
