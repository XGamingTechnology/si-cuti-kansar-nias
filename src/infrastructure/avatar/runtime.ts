import { resolve } from "node:path";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { AvatarFiles } from "./files";
import { PrismaAvatarService } from "./service";
export function avatarFiles() {
  const root = process.env.AVATAR_STORAGE_PATH;
  if (!root || !process.env.PRIVATE_STORAGE_PATH)
    throw Error("Konfigurasi storage avatar belum tersedia.");
  return new AvatarFiles(root, [
    process.env.PRIVATE_STORAGE_PATH,
    resolve(process.cwd(), "public"),
    ...(process.env.REPORT_STORAGE_PATH
      ? [process.env.REPORT_STORAGE_PATH]
      : []),
  ]);
}
export function createAvatarRuntime() {
  const files = avatarFiles(),
    runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    avatars: new PrismaAvatarService(runtime.database, files),
  };
}
