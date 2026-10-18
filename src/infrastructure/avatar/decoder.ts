import sharp from "sharp";
import {
  AVATAR_INPUT_LIMIT,
  AVATAR_PIXEL_LIMIT,
  AVATAR_DIMENSION_LIMIT,
  AvatarError,
} from "@/application/avatar/contracts";
// Bound concurrent full-pixel decodes per process as well as each input pixel budget.
let processing = 0;
export async function normalizeAvatar(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > AVATAR_INPUT_LIMIT)
    throw new AvatarError(
      413,
      "AVATAR_SIZE",
      "Foto harus berukuran 1 byte–5 MiB.",
    );
  if (!["image/jpeg", "image/png"].includes(mime))
    throw new AvatarError(
      415,
      "AVATAR_FORMAT",
      "Gunakan JPEG atau PNG, bukan SVG/URL/file lain.",
    );
  // Select only JPEG/PNG native loaders. A spoofed MIME must not invoke SVG/HEIF/etc
  // even for metadata; signature is an early gate, never a substitute for full decode.
  const png = Buffer.from(bytes.subarray(0, 8)).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((mime === "image/png" && !png) || (mime === "image/jpeg" && !jpeg))
    throw new AvatarError(
      422,
      "AVATAR_INVALID",
      "Byte foto tidak sesuai JPEG/PNG. Pilih gambar yang valid.",
    );
  if (processing >= 2)
    throw new AvatarError(
      429,
      "AVATAR_BUSY",
      "Pemrosesan foto sedang sibuk. Coba lagi.",
    );
  processing++;
  try {
    // Metadata reads the image header before decoding full pixel buffers. libvips also
    // enforces the pixel limit during decode; failOn warning rejects truncated files.
    const image = sharp(bytes, {
      limitInputPixels: AVATAR_PIXEL_LIMIT,
      failOn: "warning",
      animated: true,
      sequentialRead: true,
    });
    const m = await image.metadata();
    if (
      (m.format !== "jpeg" && m.format !== "png") ||
      mime !== `image/${m.format}` ||
      (m.pages ?? 1) !== 1 ||
      !m.width ||
      !m.height ||
      m.width > AVATAR_DIMENSION_LIMIT ||
      m.height > AVATAR_DIMENSION_LIMIT ||
      m.width * m.height > AVATAR_PIXEL_LIMIT
    )
      throw Error("format/dimension/pages");
    // Explicit APNG chunk rejection, including animation not supported by a decoder.
    if (m.format === "png") {
      let p = 8;
      while (p + 12 <= bytes.length) {
        const n = Buffer.from(
          bytes.buffer,
          bytes.byteOffset + p,
          4,
        ).readUInt32BE();
        const tag = Buffer.from(bytes.subarray(p + 4, p + 8)).toString("ascii");
        if (tag === "acTL") throw Error("animation");
        if (n > bytes.length - p - 12) throw Error("chunk");
        p += n + 12;
      }
    }
    const pipeline = image.rotate().resize({
      width: 512,
      height: 512,
      fit: "inside",
      withoutEnlargement: true,
    });
    const { data, info } = await (
      m.format === "jpeg"
        ? pipeline.jpeg({ quality: 85 })
        : pipeline.png({ compressionLevel: 8 })
    ).toBuffer({ resolveWithObject: true });
    // sharp strips EXIF/ICC/XMP by default; never call withMetadata/keepMetadata.
    return {
      bytes: data,
      mime: m.format === "jpeg" ? "image/jpeg" : "image/png",
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new AvatarError(
      422,
      "AVATAR_INVALID",
      "Gambar tidak valid, rusak, animasi, atau dimensinya terlalu besar (maks. 8192 sisi dan 16 megapiksel).",
    );
  } finally {
    processing--;
  }
}
