/**
 * Cloudflare R2 Object Storage Service for Resumes.
 * Leverages native R2Bucket binding with SHA-256 binary hashing and compensation rollback.
 */

export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[-\s]+/g, "_") || "client"
  );
}

/**
 * Computes a standard 64-character SHA-256 hex string from an ArrayBuffer using WebCrypto.
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates standardized R2 object key:
 * resumes/{client_slug}/{year}/{month}/{unique_id}_{clean_filename}
 */
export function generateResumeObjectKey(clientName: string, filename: string): string {
  const clientSlug = slugify(clientName);
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const uniqueId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const cleanFilename = filename.trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");

  return `resumes/${clientSlug}/${year}/${month}/${uniqueId}_${cleanFilename}`;
}

/**
 * Stores a file in Cloudflare R2 bucket.
 */
export async function putResumeFile(
  bucket: R2Bucket,
  key: string,
  buffer: ArrayBuffer,
  contentType: string = "application/pdf",
  originalFilename: string,
  metadata?: Record<string, string>
): Promise<R2Object> {
  return await bucket.put(key, buffer, {
    httpMetadata: {
      contentType,
      contentDisposition: `inline; filename="${originalFilename}"`,
    },
    customMetadata: {
      originalFilename,
      ...metadata,
    },
  });
}

/**
 * Retrieves a file object from Cloudflare R2 bucket.
 */
export async function getResumeFile(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return await bucket.get(key);
}

/**
 * Deletes a file from Cloudflare R2 bucket (compensation rollback or user deletion).
 */
export async function deleteResumeFile(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (err) {
    console.error(`⚠️ Failed to delete R2 object ${key}:`, err);
  }
}
