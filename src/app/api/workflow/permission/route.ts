import { createCollectionHandlers } from "@/application/workflow/delivery";
const handlers = createCollectionHandlers("permission");
export const GET = handlers.GET;
export const POST = handlers.POST;
