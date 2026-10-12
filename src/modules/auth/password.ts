import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => nodeScrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$v=1$N=${N},r=${R},p=${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, version, parameters, saltValue, keyValue] = encoded.split("$");
    if (algorithm !== "scrypt" || version !== "v=1" || parameters !== `N=${N},r=${R},p=${P}` || !saltValue || !keyValue) return false;
    const expected = Buffer.from(keyValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, Buffer.from(saltValue, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
