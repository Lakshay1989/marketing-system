import fs from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Persistent media storage on a PRIVATE S3 bucket. Meta fetches videos through a time-limited signed URL, so the bucket never needs public access.
 * Without S3 settings (local dev/tests) files go to ./media and no signed URL can be produced.
 */
export type StorageEnv = Record<string, string | undefined>;
export const s3Configured = (e: StorageEnv = process.env) => Boolean(e.MEDIA_S3_BUCKET && e.MEDIA_S3_ACCESS_KEY_ID && e.MEDIA_S3_SECRET_ACCESS_KEY);

function client(e: StorageEnv) {
  return new S3Client({ region: e.MEDIA_S3_REGION ?? "ap-southeast-2", credentials: { accessKeyId: e.MEDIA_S3_ACCESS_KEY_ID!, secretAccessKey: e.MEDIA_S3_SECRET_ACCESS_KEY! } });
}
/** Stores bytes under `key` and returns the key (the durable reference kept in the database). */
export async function putMedia(key: string, body: Buffer, contentType: string, e: StorageEnv = process.env): Promise<string> {
  if (!s3Configured(e)) { const f = path.resolve("media", key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return key; }
  await client(e).send(new PutObjectCommand({ Bucket: e.MEDIA_S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}
/** Temporary public link for Meta (default 24 h; the maximum with these credentials is 7 days). */
export async function signedMediaUrl(key: string, ttlSeconds = 86_400, e: StorageEnv = process.env): Promise<string> {
  if (!s3Configured(e)) throw new Error("Media storage (S3) is not configured, so no signed URL can be created");
  return getSignedUrl(client(e), new GetObjectCommand({ Bucket: e.MEDIA_S3_BUCKET, Key: key }), { expiresIn: ttlSeconds });
}
