import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  AuthenticationRecoveryError,
  AuthenticationRecoveryService,
} from "../src/application/authentication/recovery.ts";
import { PrismaAuthenticationRecoveryRepository } from "../src/infrastructure/auth/prisma-authentication-recovery-repository.ts";

async function hiddenQuestion(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new AuthenticationRecoveryError(
      "Terminal interaktif (TTY) diperlukan untuk input kata sandi.",
    );
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          stdin.setRawMode(false);
          reject(new AuthenticationRecoveryError("Pemulihan dibatalkan."));
          return;
        }
        if (byte === 13 || byte === 10) return finish();
        if ((byte === 8 || byte === 127) && value.length)
          value = value.slice(0, -1);
        else if (byte >= 32) value += String.fromCharCode(byte);
      }
    };
    stdin.on("data", onData);
  });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL wajib diisi.");
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const recovery = new AuthenticationRecoveryService(
  new PrismaAuthenticationRecoveryRepository(database),
);
const terminal = createInterface({ input: stdin, output: stdout });

try {
  stdout.write("Pemulihan darurat Admin Kepegawaian (khusus operator VPS)\n");
  const nip = (await terminal.question("NIP pegawai yang sudah ada: ")).trim();
  const target = await recovery.inspect(nip);
  stdout.write(`Akun ditemukan untuk ${target.fullName} (${target.nip}).\n`);
  terminal.close();
  const password = await hiddenQuestion("Kata sandi baru: ");
  const confirmation = await hiddenQuestion("Konfirmasi kata sandi baru: ");
  if (password !== confirmation)
    throw new AuthenticationRecoveryError("Konfirmasi kata sandi tidak cocok.");
  const confirm = createInterface({ input: stdin, output: stdout });
  const approval = await confirm.question(
    'Ketik "PULIHKAN" untuk menjalankan perubahan: ',
  );
  confirm.close();
  if (approval !== "PULIHKAN")
    throw new AuthenticationRecoveryError(
      "Pemulihan dibatalkan; tidak ada perubahan yang disimpan.",
    );
  await recovery.recover(nip, password);
  stdout.write("Pemulihan berhasil. Semua sesi lama akun telah dicabut.\n");
} catch (error) {
  terminal.close();
  const message =
    error instanceof AuthenticationRecoveryError
      ? error.message
      : "Pemulihan akun gagal.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
