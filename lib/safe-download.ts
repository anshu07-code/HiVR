/**
 * Safely download a file from a server-issued signed URL without
 * exposing the URL in the browser address bar.
 *
 *   1. Fetch the resource as a blob
 *   2. Create a temporary object URL
 *   3. Trigger a download via a hidden <a download> element
 *   4. Revoke the object URL after the download starts
 *
 * This prevents signed URLs (which often contain auth tokens) from
 * leaking into:
 *   - the browser address bar (via window.open)
 *   - the user's browsing history
 *   - referrer headers to other origins
 */
export async function downloadFromSignedUrl(
  signedUrl: string,
  filename: string,
  options: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "GET",
    signal: options.signal,
    credentials: "omit",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !total || typeof res.body.getReader !== "function") {
    // Fallback for browsers without streaming body
    const blob = await res.blob();
    triggerDownload(blob, filename);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      options.onProgress?.(loaded, total);
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") ?? "application/octet-stream" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  // Give the browser a tick to start the download before cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
