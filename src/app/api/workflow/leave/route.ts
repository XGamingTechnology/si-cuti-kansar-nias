import { createCollectionHandlers } from "@/application/workflow/delivery";
const handlers = createCollectionHandlers("leave");
export const GET = handlers.GET;
export const POST = handlers.POST;
