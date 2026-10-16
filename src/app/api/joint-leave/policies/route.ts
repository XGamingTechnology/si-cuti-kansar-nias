import { createJointLeaveHandler } from "@/application/joint-leave/delivery";
const handler = createJointLeaveHandler("policies");
export const GET = handler;
export const POST = handler;
