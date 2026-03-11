import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { users } from "@/db/schema";
import { resizeAvatar } from "@/lib/avatar";
import { avatarUploadSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

/**
 * POST /api/avatar
 *
 * Accepts a multipart/form-data upload with:
 *  - `file`     — the avatar image (JPEG / PNG / WebP / GIF)
 *  - `playerId` — the user ID to update
 *
 * The image is resized to 500 × 500 px using Lanczos3 neural-quality
 * resampling and its public URL is stored in users.avatar_url.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const playerId = formData.get("playerId");

  if (!(file instanceof File) || typeof playerId !== "string") {
    return NextResponse.json(
      { success: false, error: "Missing file or playerId" },
      { status: 400 }
    );
  }

  const validation = avatarUploadSchema.safeParse({
    size: file.size,
    type: file.type,
  });

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: validation.error.issues[0]?.message },
      { status: 422 }
    );
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const processed = await resizeAvatar(inputBuffer);

  const blob = await put(`avatars/player-${playerId}.png`, processed.buffer, {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: true,
  });

  const avatarUrl = blob.url;

  await db
    .update(users)
    .set({ avatar_url: avatarUrl })
    .where(eq(users.id, Number(playerId)));

  return NextResponse.json({
    success: true,
    data: {
      avatarUrl,
      width: processed.width,
      height: processed.height,
      mimeType: processed.mimeType,
    },
  });
}
