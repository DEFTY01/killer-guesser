import { NextRequest, NextResponse } from "next/server";

const BLOB_HOSTNAME_SUFFIX = ".blob.vercel-storage.com";

/**
 * GET /api/blob-image?url=<encoded-blob-url>
 *
 * Server-side proxy for private Vercel Blob assets.
 * Vercel's next/image optimizer and browsers cannot directly access private
 * blob URLs because they require a Bearer token.  This route fetches the
 * blob on the server using BLOB_READ_WRITE_TOKEN and streams it back, so
 * next/image can optimise the image and browsers can display it normally.
 *
 * Security: only URLs from *.blob.vercel-storage.com are accepted (SSRF guard).
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");

  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // SSRF guard — only proxy Vercel Blob Store URLs.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!parsed.hostname.endsWith(BLOB_HOSTNAME_SUFFIX)) {
    return new NextResponse("URL not allowed", { status: 403 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return new NextResponse("Storage not configured", { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(rawUrl, {
      headers: { authorization: `Bearer ${token}` },
      // Avoid Next.js data cache so the correct blob is always returned.
      cache: "no-store",
    });
  } catch {
    return new NextResponse("Failed to reach blob storage", { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse("Blob not found", { status: upstream.status });
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // Blobs are immutable — cache aggressively in browser and CDN.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
