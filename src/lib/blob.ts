import { put } from "@vercel/blob";

/**
 * Uploads a file buffer to Vercel Blob storage and returns the resulting URL.
 *
 * The BLOB_READ_WRITE_TOKEN environment variable is picked up automatically
 * by the @vercel/blob SDK — no manual client initialisation is needed.
 *
 * @param filename - The desired filename (will be made unique by the SDK).
 * @param buffer   - The file contents as a Buffer or Uint8Array.
 * @param mimeType - The MIME type of the file (e.g. "image/webp").
 * @returns The public URL of the uploaded blob.
 */
export async function uploadBlob(
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: true,
  });
  return blob.url;
}
