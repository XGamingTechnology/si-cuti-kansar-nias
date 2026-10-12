import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? sourceFiles(join(path, entry.name)) : Promise.resolve(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [join(path, entry.name)] : [])))).flat();
}
describe("authentication architecture", () => {
  it("does not introduce JWT implementations or dependencies", async () => {
    const packageJson = await readFile("package.json", "utf8");
    expect(packageJson.toLowerCase()).not.toContain("jsonwebtoken");
    expect(packageJson.toLowerCase()).not.toContain("jose");
    for (const file of await sourceFiles("src")) expect((await readFile(file, "utf8")).toLowerCase()).not.toContain("jwt");
  });
});
