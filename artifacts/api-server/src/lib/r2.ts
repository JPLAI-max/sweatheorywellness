import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { request as httpsRequest } from "node:https";
import { logger } from "./logger";
import { db, preservationHoldsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

// R2_ENDPOINT takes priority (full URL e.g. https://<account>.r2.cloudflarestorage.com).
// Fallback: extract the 32-char hex account ID from R2_ACCOUNT_ID and build the URL.
const _r2Endpoint = (process.env.R2_ENDPOINT ?? "").replace(/\/$/, "");
const _rawAccountId = process.env.R2_ACCOUNT_ID ?? "";
const _accountMatch = _rawAccountId.match(/([0-9a-f]{32})/i);
const _accountId = _accountMatch ? _accountMatch[1].toLowerCase() : _rawAccountId;
const R2_BASE_ENDPOINT = _r2Endpoint || `https://${_accountId}.r2.cloudflarestorage.com`;

const ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID_VALUE || process.env.R2_ACCESS_KEY_ID)!;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
export const BUCKET_MEDIA = process.env.R2_BUCKET_MEDIA ?? "gooncity-media";
export const BUCKET_PRIVATE = process.env.R2_BUCKET_PRIVATE ?? "gooncity-private";
const MEDIA_PUBLIC_URL = process.env.R2_MEDIA_PUBLIC_URL ?? "";

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: R2_BASE_ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    // Force path-style URLs so presigned URLs use
    // https://{account}.r2.cloudflarestorage.com/{bucket}/key
    // instead of the virtual-hosted form bucket.{account}.r2.cloudflarestorage.com
    // which doesn't match the CORS policy endpoint.
    forcePathStyle: true,
  });
}

export async function getPresignedUploadUrl(
  bucket: "media" | "private",
  key: string,
  contentType: string,
  expiresIn = 300,
  fileSizeBytes?: number,
): Promise<string> {
  const client = getClient();
  const bucketName = bucket === "media" ? BUCKET_MEDIA : BUCKET_PRIVATE;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    // Note: ContentLength intentionally excluded from signed params —
    // including it causes R2 to reject browser PUT requests when the
    // browser's auto-computed Content-Length differs even slightly.
  });
  return getSignedUrl(client, command, { expiresIn });
}

export function getPublicUrl(key: string): string {
  if (MEDIA_PUBLIC_URL) {
    return `${MEDIA_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return `${R2_BASE_ENDPOINT}/${BUCKET_MEDIA}/${key}`;
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: BUCKET_PRIVATE, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function putR2Stream(
  bucket: "media" | "private",
  key: string,
  body: NodeJS.ReadableStream,
  contentType: string,
  contentLength?: number,
): Promise<void> {
  // Generate a fresh presigned URL (pure crypto — no network request, no TLS)
  const presignedUrl = await getPresignedUploadUrl(bucket, key, contentType, 300, contentLength);

  // Use Node.js native fetch (undici) rather than the AWS SDK HTTP client.
  // The SDK's https agent fails TLS negotiation with R2 in this environment;
  // undici's TLS stack succeeds.
  const res = await fetch(presignedUrl, {
    method: "PUT",
    body: body as any,
    headers: {
      "Content-Type": contentType,
      ...(contentLength !== undefined ? { "Content-Length": String(contentLength) } : {}),
    },
    // Required for streaming request bodies in undici/Node fetch
    duplex: "half",
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 PUT failed: ${res.status} ${text}`);
  }
}

export async function putR2Object(
  bucket: "media" | "private",
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  // Use presigned URL + Node's native https module.
  // Both the AWS SDK HTTP client and undici (fetch) fail TLS negotiation with
  // R2 in this environment. Node's built-in https uses OpenSSL directly and
  // succeeds where the other two stacks do not.
  const presignedUrl = await getPresignedUploadUrl(bucket, key, contentType, 300);
  const url = new URL(presignedUrl);

  logger.debug({ host: url.hostname, bucket }, "R2 PUT via node:https");

  return new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            const body = Buffer.concat(chunks).toString("utf8");
            reject(new Error(`R2 PUT failed: ${res.statusCode} ${body}`));
          }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      logger.error({ err: { message: err.message, code: err.code, host: url.hostname } }, "R2 PUT node:https error");
      reject(new Error(`R2 PUT connection error: ${err.code ?? err.message}`));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Reverse getPublicUrl: extract the R2 object key from a public media URL.
 * Returns null if the URL doesn't match a known R2 origin (e.g. an external URL).
 */
export function r2KeyFromPublicUrl(url: string): string | null {
  if (!url) return null;
  if (MEDIA_PUBLIC_URL) {
    const base = MEDIA_PUBLIC_URL.replace(/\/$/, "") + "/";
    if (url.startsWith(base)) return url.slice(base.length);
  }
  const fallbackPrefix = `https://${_accountId}.r2.cloudflarestorage.com/${BUCKET_MEDIA}/`;
  if (url.startsWith(fallbackPrefix)) return url.slice(fallbackPrefix.length);
  return null;
}

/**
 * Extract the R2 object key from a presigned private-bucket URL.
 * Presigned URLs have the form:
 *   https://{account}.r2.cloudflarestorage.com/{BUCKET_PRIVATE}/{key}?X-Amz-...
 * Returns null if the URL doesn't match.
 */
export function r2KeyFromStagedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const r2Host = new URL(R2_BASE_ENDPOINT).hostname;
    const prefix = `/${BUCKET_PRIVATE}/`;
    if (parsed.hostname === r2Host && parsed.pathname.startsWith(prefix)) {
      return parsed.pathname.slice(prefix.length);
    }
    return null;
  } catch {
    return null;
  }
}

// Raw R2 key pattern: <folder>/<numericUserId>/<nanoid>.<ext>
const RAW_KEY_RE = /^[a-zA-Z0-9_-]+\/\d+\/[a-zA-Z0-9_-]+\.[a-z0-9]{2,4}$/;

/** Returns true if the string is a raw R2 object key (not a URL). */
export function isRawR2Key(value: string): boolean {
  return RAW_KEY_RE.test(value);
}

/**
 * Returns true when the value points to a valid R2 media object —
 * a permanent public-bucket URL, a staged presigned private-bucket URL,
 * or a raw R2 object key.
 */
export function isValidR2MediaUrl(url: string): boolean {
  return r2KeyFromPublicUrl(url) !== null || r2KeyFromStagedUrl(url) !== null || isRawR2Key(url);
}

/**
 * Extract the R2 object key and originating bucket from any stored media reference:
 * raw key, presigned private-bucket URL, or legacy public-bucket URL.
 * Returns null if the value doesn't match any known format.
 */
export function r2KeyExtract(
  keyOrUrl: string | null | undefined,
): { key: string; bucket: "media" | "private" } | null {
  if (!keyOrUrl) return null;
  if (!keyOrUrl.startsWith("http")) {
    return isRawR2Key(keyOrUrl) ? { key: keyOrUrl, bucket: "private" } : null;
  }
  const privateKey = r2KeyFromStagedUrl(keyOrUrl);
  if (privateKey) return { key: privateKey, bucket: "private" };
  const mediaKey = r2KeyFromPublicUrl(keyOrUrl);
  if (mediaKey) return { key: mediaKey, bucket: "media" };
  return null;
}

/**
 * Mint a fresh ~1-hour presigned download URL for serving clean content.
 * Handles all stored formats: raw key, legacy presigned URL, legacy public URL.
 * Returns null for null/undefined input.
 */
export async function serveMediaUrl(keyOrUrl: string | null | undefined): Promise<string | null> {
  if (!keyOrUrl) return null;
  if (!keyOrUrl.startsWith("http")) {
    // Raw R2 key (canonical new format) — private bucket
    return getPresignedDownloadUrl(keyOrUrl, 3600);
  }
  const privateKey = r2KeyFromStagedUrl(keyOrUrl);
  if (privateKey) {
    // Legacy presigned private-bucket URL — mint a fresh one
    return getPresignedDownloadUrl(privateKey, 3600);
  }
  if (r2KeyFromPublicUrl(keyOrUrl) !== null) {
    // Legacy public media URL — pass through (object lives in public bucket)
    return keyOrUrl;
  }
  // External URL or unknown — pass through as-is
  return keyOrUrl;
}

/**
 * Returns the ContentLength of an R2 object in bytes.
 * Returns 0 if the object doesn't exist or R2 is not configured.
 */
export async function getR2ObjectSize(bucket: "media" | "private", key: string): Promise<number> {
  try {
    const client = getClient();
    const bucketName = bucket === "media" ? BUCKET_MEDIA : BUCKET_PRIVATE;
    const res = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return res.ContentLength ?? 0;
  } catch {
    return 0;
  }
}

export async function deleteR2Object(bucket: "media" | "private", key: string): Promise<void> {
  // Preservation hold check — fail-closed: if we cannot verify the hold status,
  // do NOT delete. The object must survive over any temporary DB outage.
  try {
    const [hold] = await db
      .select({ id: preservationHoldsTable.id })
      .from(preservationHoldsTable)
      .where(and(
        eq(preservationHoldsTable.identifierType, "r2_key"),
        eq(preservationHoldsTable.identifierValue, key),
        eq(preservationHoldsTable.released, false),
      ))
      .limit(1);
    if (hold) {
      logger.warn({ bucket, key }, "preservation: R2 object NOT deleted — active hold (CSAM/NCMEC preservation)");
      return;
    }
  } catch (holdErr) {
    logger.error({ holdErr, bucket, key }, "preservation: hold check failed — skipping delete (fail-closed)");
    return;
  }

  try {
    const client = getClient();
    const bucketName = bucket === "media" ? BUCKET_MEDIA : BUCKET_PRIVATE;
    await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    logger.info({ bucket, key }, "Deleted R2 object");
  } catch (err) {
    logger.error({ err, bucket, key }, "Failed to delete R2 object");
  }
}

/**
 * List all objects under a key prefix and delete them in batches of 1000.
 * Used for comprehensive cleanup of all user-owned objects in a bucket.
 */
export async function deleteR2ObjectsByPrefix(bucket: "media" | "private", prefix: string): Promise<void> {
  try {
    const client = getClient();
    const bucketName = bucket === "media" ? BUCKET_MEDIA : BUCKET_PRIVATE;
    let continuationToken: string | undefined;

    do {
      const listRes = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      const keys = (listRes.Contents ?? [])
        .map(obj => obj.Key)
        .filter((k): k is string => typeof k === "string");

      if (keys.length > 0) {
        // Check holds for this batch — fail-closed: skip entire batch on error.
        let heldKeys = new Set<string>();
        let holdCheckFailed = false;
        try {
          const holds = await db
            .select({ identifierValue: preservationHoldsTable.identifierValue })
            .from(preservationHoldsTable)
            .where(and(
              eq(preservationHoldsTable.identifierType, "r2_key"),
              inArray(preservationHoldsTable.identifierValue, keys),
              eq(preservationHoldsTable.released, false),
            ));
          heldKeys = new Set(holds.map(h => h.identifierValue));
        } catch (holdErr) {
          holdCheckFailed = true;
          logger.error(
            { holdErr, bucket, prefix, keyCount: keys.length },
            "preservation: hold check failed — skipping batch delete (fail-closed)",
          );
        }

        if (!holdCheckFailed) {
          if (heldKeys.size > 0) {
            logger.warn(
              { bucket, prefix, heldKeys: [...heldKeys] },
              "preservation: skipping held R2 keys in prefix delete (CSAM/NCMEC preservation)",
            );
          }
          const deletableKeys = keys.filter(k => !heldKeys.has(k));
          if (deletableKeys.length > 0) {
            await client.send(new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: { Objects: deletableKeys.map(k => ({ Key: k })) },
            }));
            logger.info({ bucket, prefix, count: deletableKeys.length }, "Deleted R2 objects by prefix");
          }
        }
      }

      continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    logger.error({ err, bucket, prefix }, "Failed to delete R2 objects by prefix");
  }
}
