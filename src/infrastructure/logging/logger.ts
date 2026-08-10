import pino from "pino";

const redact = ["password", "*.password", "sessionSecret", "*.sessionSecret", "token", "*.token", "req.headers.authorization", "req.headers.cookie", "document.content"];
export function createLogger(level = process.env.LOG_LEVEL ?? "info") {
  return pino({ level, base: { service: "si-cuti" }, redact: { paths: redact, censor: "[REDACTED]" } });
}
