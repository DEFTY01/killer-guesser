import { NextRequest, NextResponse } from "next/server";
import { uploadBlob } from "@/lib/blob";
import { requireAdmin } from "@/lib/auth-helpers";
import { resizeAvatar } from "@/lib/avatar";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = ["image/webp", "image/gif", "image/png", "image/jpeg"] as const;

/**
 * POST /api/upload/avatar
 *
 * Accepts a multipart/form-data request with a `file` field.
 * Only `image/webp`, `image/gif`, `image/png`, and `image/jpeg` formats are accepted.
 * Files larger than 4 MB are rejected with a 400 error.
 *
 * On success returns `{ url: string }` containing the Vercel Blob public URL.
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Missing file field" },
      { status: 400 },
    );
  }

  // Validate MIME type — webp, gif, png, and jpeg are accepted.
  const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!isAllowedType) {
    return NextResponse.json(
      {
        success: false,
        error: "Only image/webp, image/gif, image/png, and image/jpeg formats are accepted",
      },
      { status: 400 },
    );
  }

  // Enforce 4 MB maximum before calling put().
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: "File size must not exceed 4 MB" },
      { status: 400 },
    );
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Resize to 500 × 500 with Lanczos3 then apply 16-bit pixel art effect.
  const processed = await resizeAvatar(inputBuffer);

  const filename = `avatars/avatar-${crypto.randomUUID()}.png`;

  const url = await uploadBlob(filename, processed.buffer, "image/png");

  return NextResponse.json({ success: true, url });
}
