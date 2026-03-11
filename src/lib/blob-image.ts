/**
 * Converts a Vercel Blob storage URL to a same-origin proxy URL.
 *
 * Private Vercel Blob stores require a Bearer token.  Serving images directly
 * from *.private.blob.vercel-storage.com breaks next/image
 * (OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED) and fails in the browser.
 *
 * This helper routes blob URLs through /api/blob-image which fetches the blob
 * server-side with the BLOB_READ_WRITE_TOKEN.
 *
 * Pass-through cases (returned unchanged):
 *  - null / undefined → ""
 *  - Local file previews (blob: / data:) — already browser-accessible
 *  - Non-blob-storage URLs
 */
export function blobImageSrc(url: string | null | undefined): string {
  if (!url) return "";
  // Local file URLs from URL.createObjectURL() or data URIs are
  // browser-accessible without going through the server proxy.
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.includes(".blob.vercel-storage.com")) {
    return `/api/blob-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
