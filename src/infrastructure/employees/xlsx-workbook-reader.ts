import { inflateRawSync } from "node:zlib";
import { EmployeeError } from "@/application/employees/service";
import type { EmployeeWorkbookReader } from "@/application/employees/import-service";

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function unzip(input: Uint8Array): Map<string, Buffer> {
  const buffer = Buffer.from(input);
  const files = new Map<string, Buffer>();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw new Error();
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > 1000) throw new Error("Terlalu banyak entri XLSX.");
  for (let entry = 0; entry < entries; entry++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new Error();
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    if (
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    )
      throw new Error();
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    if (compressedSize > 5_000_000 || start + compressedSize > buffer.length)
      throw new Error("Arsip XLSX tidak aman.");
    const compressed = buffer.subarray(start, start + compressedSize);
    if (name.startsWith("xl/") && !name.includes(".."))
      files.set(
        name,
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: 10_000_000 })
            : Buffer.alloc(0),
      );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export class XlsxWorkbookReader implements EmployeeWorkbookReader {
  async read(input: Uint8Array): Promise<readonly (readonly unknown[])[]> {
    try {
      if (input.length < 4 || Buffer.from(input).readUInt32LE(0) !== 0x04034b50)
        throw new Error();
      const files = unzip(input);
      const sheet = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
      if (!sheet) throw new Error();
      const sharedXml =
        files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
      const shared = [
        ...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
      ].map((item) =>
        decodeXml(
          [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
            .map((part) => part[1])
            .join(""),
        ),
      );
      const rows: unknown[][] = [];
      for (const row of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const cells: unknown[] = [];
        for (const cell of row[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
          const reference = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1] ?? "A";
          let column = 0;
          for (const letter of reference)
            column = column * 26 + letter.charCodeAt(0) - 64;
          const raw =
            /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ??
            /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1] ??
            "";
          cells[column - 1] = /\bt="s"/.test(cell[1])
            ? (shared[Number(raw)] ?? "")
            : decodeXml(raw);
        }
        const rowNumber = Number(
          /\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1,
        );
        while (rows.length < rowNumber - 1) rows.push([]);
        rows[rowNumber - 1] = cells;
      }
      return rows;
    } catch {
      throw new EmployeeError(
        "VALIDATION",
        "File XLSX rusak atau tidak didukung.",
      );
    }
  }
}
