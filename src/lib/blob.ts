import { put } from "@vercel/blob";

/**
 * Uploads a file buffer to Vercel Blob storage and returns a usable URL.
 *
 * The BLOB_READ_WRITE_TOKEN environment variable is picked up automatically
 * by the @vercel/blob SDK — no manual client initialisation is needed.
 *
 * @param filename - The desired filename (will be made unique by the SDK).
 * @param buffer   - The file contents as a Buffer or Uint8Array.
 * @param mimeType - The MIME type of the file (e.g. "image/webp").
 * @returns A URL suitable for rendering/downloading the uploaded blob.
 */
export async function uploadBlob(
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const blob = await put(filename, buffer, {
    // This project uses a private Vercel Blob store.
    access: "private",
    contentType: mimeType,
    addRandomSuffix: true,
  });

  // Private uploads expose a signed download URL; public uploads only expose url.
  return blob.downloadUrl ?? blob.url;
}
