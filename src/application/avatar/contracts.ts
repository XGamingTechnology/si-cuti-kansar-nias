export const AVATAR_INPUT_LIMIT = 5 * 1024 * 1024;
export const AVATAR_PIXEL_LIMIT = 16_777_216;
export const AVATAR_DIMENSION_LIMIT = 8192;
export class AvatarError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type AvatarView = {
  version: number;
  hasPhoto: boolean;
  updatedAt: string | null;
  imageUrl: string | null;
};
export const avatarView = (
  v: { version: number; storageKey: string | null; updatedAt: Date } | null,
): AvatarView => ({
  version: v?.version ?? 0,
  hasPhoto: Boolean(v?.storageKey),
  updatedAt: v?.updatedAt.toISOString() ?? null,
  imageUrl: v?.storageKey ? `/api/me/avatar/image?v=${v.version}` : null,
});

export function parseAvatarView(value: unknown): AvatarView {
  if (!value || typeof value !== "object")
    throw Error("Respons foto tidak valid.");
  const v = value as AvatarView;
  if (
    !Number.isSafeInteger(v.version) ||
    v.version < 0 ||
    typeof v.hasPhoto !== "boolean" ||
    !(v.updatedAt === null || typeof v.updatedAt === "string") ||
    v.imageUrl !== (v.hasPhoto ? `/api/me/avatar/image?v=${v.version}` : null)
  )
    throw Error("Respons foto tidak valid.");
  return {
    version: v.version,
    hasPhoto: v.hasPhoto,
    updatedAt: v.updatedAt,
    imageUrl: v.imageUrl,
  };
}
