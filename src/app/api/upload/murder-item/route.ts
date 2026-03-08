import { NextRequest, NextResponse } from "next/server";
import { uploadBlob } from "@/lib/blob";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/**
 * POST /api/upload/murder-item
 *
 * Accepts a multipart/form-data request with a `file` field.
 * Accepts jpeg, png, webp, and gif formats up to 4 MB.
 * Uploads the file to Vercel Blob storage and returns the public URL.
 *
 * On success returns `{ url: string }`.
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

  const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!isAllowedType) {
    return NextResponse.json(
      {
        success: false,
        error: "Only jpeg, png, webp, and gif formats are accepted",
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: "File size must not exceed 4 MB" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extByMime[file.type] ?? "bin";
  const filename = `murder-items/murder-item-${crypto.randomUUID()}.${ext}`;

  const url = await uploadBlob(filename, buffer, file.type);

  return NextResponse.json({ success: true, url });
}
