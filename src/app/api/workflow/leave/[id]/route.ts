import { createDetailHandlers } from "@/application/workflow/delivery";
const handlers = createDetailHandlers("leave");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
