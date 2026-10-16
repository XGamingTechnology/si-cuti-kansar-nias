import { createJointLeaveHandler } from "@/application/joint-leave/delivery";
const handler = createJointLeaveHandler("duplicates");
export const GET = handler;
