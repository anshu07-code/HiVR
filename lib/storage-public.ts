/**
 * Returns the public URL for a file in a public Supabase Storage
 * bucket. The caller passes the bucket name (e.g. "profile-videos")
 * and the storage path. No async — pure URL construction.
 *
 * If NEXT_PUBLIC_SUPABASE_URL is missing the function returns an empty
 * string. Server-side callers should always treat the result as
 * best-effort.
 */
export function getPublicVideoUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
