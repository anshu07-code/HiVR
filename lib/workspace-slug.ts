/**
 * Workspace slug helpers.
 *
 * Slugs hide the full UUID from URLs by combining a task-title slug
 * with the last 8 characters of the workspace UUID:
 *
 *   /dashboard/workspaces/fix-bug--a1b2c3d4
 *
 * The route accepts both slug and raw UUID formats so existing links
 * / bookmarks still work.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if the param is a full UUID (including hyphens) */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Build a display-safe slug from a task title + workspace UUID */
export function encodeWorkspaceSlug(title: string | null | undefined, workspaceId: string): string {
  const safe = (title ?? "workspace")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${safe || "workspace"}--${workspaceId.slice(-8)}`;
}

/**
 * Parse a slug back to the last-8-chars fragment used to look up
 * the workspace. Returns null for raw-UUID params.
 */
export function decodeWorkspaceSlug(slug: string): { shortId: string } | null {
  if (isUuid(slug)) return null; // raw UUID — look up directly
  const parts = slug.split("--");
  const tail = parts[parts.length - 1];
  if (tail && /^[0-9a-f]{8}$/i.test(tail)) return { shortId: tail };
  return null;
}
