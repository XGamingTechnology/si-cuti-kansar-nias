import { createJointLeaveHandler } from "@/application/joint-leave/delivery";
const handler = createJointLeaveHandler("claims");
export const GET = handler;
export const POST = handler;
