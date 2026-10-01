import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeOriginalFilename,
  PHOTO_UPLOAD_URL_TTL_SECONDS,
} from "@/lib/server/jobs/photo-upload-policy";
import { isPhotoObjectKey } from "@/lib/server/storage/photo-object-key";

/**
 * Binds a presigned upload to the authorizing user until finalize.
 *
 * Signing reuses the server HMAC-SHA256 + timingSafeEqual construction already
 * used for short-lived capability tokens. The MAC input is domain-separated
 * from session cookies and deactivation tokens, and the payload purpose is
 * PHOTO_UPLOAD_INTENT, which the session verifier rejects.
 *
 * The MAC key is SESSION_SECRET. That secret is already required in production
 * (at least 32 characters). No additional long-lived secret is introduced.
 * Rotating SESSION_SECRET invalidates in-flight intents; their lifetime is the
 * upload URL TTL (10 minutes).
 *
 * This module does not call createSignedSessionToken and does not set cookies.
 */

export const PHOTO_UPLOAD_INTENT_PURPOSE = "PHOTO_UPLOAD_INTENT" as const;

const MAC_DOMAIN = "vectorwork.photo-upload-intent.v1";
const STORAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOKEN_LENGTH = 4096;

export type PhotoUploadIntentClaims = {
  userId: string;
  companyId: string;
  jobId: string;
  jobStageId: string | null;
  objectKey: string;
  originalFilename: string | null;
  exp: number;
};

export type PhotoUploadIntentBinding = "ok" | "wrong_user" | "mismatch";

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

function mac(payloadJson: string): Buffer {
  return createHmac("sha256", getSigningSecret())
    .update(MAC_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(payloadJson, "utf8")
    .digest();
}

function isStorageId(value: unknown): value is string {
  return typeof value === "string" && STORAGE_ID.test(value);
}

function isJobStageClaim(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && !/[\u0000-\u001f\u007f/\\]/.test(value);
}

function isFilenameClaim(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === "string" && normalizeOriginalFilename(value) === value;
}

function claimsFromJson(payloadJson: string, nowMs: number): PhotoUploadIntentClaims | null {
  let data: unknown;
  try {
    data = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  if (record.purpose !== PHOTO_UPLOAD_INTENT_PURPOSE) return null;
  if (!isStorageId(record.userId) || !isStorageId(record.companyId) || !isStorageId(record.jobId)) {
    return null;
  }
  if (!isJobStageClaim(record.jobStageId)) return null;
  if (typeof record.objectKey !== "string" || !isPhotoObjectKey(record.objectKey)) return null;
  const prefix = `companies/${record.companyId}/jobs/${record.jobId}/photos/`;
  if (!record.objectKey.startsWith(prefix)) return null;
  if (!isFilenameClaim(record.originalFilename)) return null;
  if (typeof record.exp !== "number" || !Number.isInteger(record.exp)) return null;
  if (record.exp <= 0 || record.exp > 10_000_000_000) return null;
  if (Math.floor(nowMs / 1000) >= record.exp) return null;

  return {
    userId: record.userId,
    companyId: record.companyId,
    jobId: record.jobId,
    jobStageId: record.jobStageId,
    objectKey: record.objectKey,
    originalFilename: record.originalFilename,
    exp: record.exp,
  };
}

export function createPhotoUploadIntent(
  input: Omit<PhotoUploadIntentClaims, "exp">,
  nowMs = Date.now()
): string {
  if (!Number.isFinite(nowMs)) throw new Error("INVALID_PHOTO_UPLOAD");

  const exp = Math.floor(nowMs / 1000) + PHOTO_UPLOAD_URL_TTL_SECONDS;
  const payloadJson = JSON.stringify({
    purpose: PHOTO_UPLOAD_INTENT_PURPOSE,
    userId: input.userId,
    companyId: input.companyId,
    jobId: input.jobId,
    jobStageId: input.jobStageId,
    objectKey: input.objectKey,
    originalFilename: input.originalFilename,
    exp,
  });
  const claims = claimsFromJson(payloadJson, nowMs);
  if (!claims) throw new Error("INVALID_PHOTO_UPLOAD");

  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = mac(payloadJson).toString("base64url");
  return Buffer.from(`${payloadB64}.${signature}`, "utf8").toString("base64url");
}

export function verifyPhotoUploadIntent(
  token: string,
  nowMs = Date.now()
): PhotoUploadIntentClaims | null {
  try {
    if (typeof token !== "string" || token.length < 20 || token.length > MAX_TOKEN_LENGTH) return null;
    if (!Number.isFinite(nowMs)) return null;

    const inner = Buffer.from(token, "base64url").toString("utf8");
    const dot = inner.indexOf(".");
    if (dot <= 0) return null;

    const payloadJson = Buffer.from(inner.slice(0, dot), "base64url").toString("utf8");
    if (payloadJson.length < 2 || payloadJson.length > 2048) return null;

    const expected = mac(payloadJson);
    const actual = Buffer.from(inner.slice(dot + 1), "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    return claimsFromJson(payloadJson, nowMs);
  } catch (error) {
    if (error instanceof Error && error.message.includes("SESSION_SECRET")) throw error;
    return null;
  }
}

export function photoUploadIntentBinding(
  claims: PhotoUploadIntentClaims,
  expected: {
    userId: string;
    companyId: string;
    jobId: string;
    jobStageId: string | null;
    objectKey: string;
    originalFilename: string | null;
  }
): PhotoUploadIntentBinding {
  if (claims.userId !== expected.userId) return "wrong_user";
  if (
    claims.companyId !== expected.companyId ||
    claims.jobId !== expected.jobId ||
    claims.jobStageId !== expected.jobStageId ||
    claims.objectKey !== expected.objectKey ||
    claims.originalFilename !== expected.originalFilename
  ) {
    return "mismatch";
  }
  return "ok";
}
