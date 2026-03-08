import { NextRequest, NextResponse } from "next/server";
import { uploadBlob } from "@/lib/blob";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = ["image/webp", "image/gif"] as const;

/**
 * POST /api/upload/avatar
 *
 * Accepts a multipart/form-data request with a `file` field.
 * Only `image/webp` and `image/gif` formats are accepted.
 * Files larger than 4 MB are rejected with a 400 error.
 *
 * On success returns `{ url: string }` containing the Vercel Blob public URL.
 */
export async function POST(req: NextRequest) {
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

  // Validate MIME type — only webp and gif are accepted.
  const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!isAllowedType) {
    return NextResponse.json(
      {
        success: false,
        error: "Only image/webp and image/gif formats are accepted",
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/webp" ? "webp" : "gif";
  const filename = `avatars/avatar.${ext}`;

  const url = await uploadBlob(filename, buffer, file.type);

  return NextResponse.json({ success: true, url });
}
