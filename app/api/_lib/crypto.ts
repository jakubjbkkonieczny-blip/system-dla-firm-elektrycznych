import crypto from "crypto";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomApiKey() {
  return crypto.randomBytes(32).toString("hex"); // 64 znaki
}