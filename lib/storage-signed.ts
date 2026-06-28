/**
 * lib/storage-signed.ts — server-only signed URL helpers.
 * MUST NOT be imported from "use client" components or anything that
 * ends up in the client bundle, because it uses the server Supabase
 * client (which depends on next/headers).
 */

/**
 * Returns a signed URL into a private bucket, valid for `expiresInSec` seconds.
 * Returns null on error.
 */
export async function getSignedVideoUrl(
  bucket: string,
  path: string,
  expiresInSec = 60 * 10,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const sb = createClient();
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSec);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
