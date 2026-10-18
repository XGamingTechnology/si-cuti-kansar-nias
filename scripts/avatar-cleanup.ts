// Operational CLI; never exposed through a web route. Requires only SELECT UserAvatar + avatar volume.
import { createDatabaseClient } from "../src/infrastructure/database/client.ts";
import { avatarFiles } from "../src/infrastructure/avatar/runtime.ts";
import { PrismaAvatarService } from "../src/infrastructure/avatar/service.ts";
async function main() {
  const db = createDatabaseClient();
  try {
    const result = await new PrismaAvatarService(db, avatarFiles()).cleanup();
    console.log(JSON.stringify(result));
    if (!result.healthy) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    '{"healthy":false,"error":"Cleanup avatar gagal; periksa namespace, DB, permission dan backlog."}',
  );
  process.exitCode = 1;
});
