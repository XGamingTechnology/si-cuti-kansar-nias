import { avatarHandler } from "@/application/avatar/http";
export const GET = avatarHandler("metadata");
export const PUT = avatarHandler("upload");
export const DELETE = avatarHandler("delete");
