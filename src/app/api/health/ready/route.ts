import { checkDatabaseConnection } from "@/infrastructure/database/health";
import { parseServerEnvironment } from "@/config/env";

export async function GET() {
  try { parseServerEnvironment(); }
  catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
  const ready = await checkDatabaseConnection();
  return Response.json({ status: ready ? "ready" : "unavailable" }, { status: ready ? 200 : 503 });
}
