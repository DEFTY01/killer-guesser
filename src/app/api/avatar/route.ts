import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players } from "@/db/schema";
import { resizeAvatar } from "@/lib/avatar";
import { avatarUploadSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

/**
 * POST /api/avatar
 *
 * Accepts a multipart/form-data upload with:
 *  - `file`     — the avatar image (JPEG / PNG / WebP / GIF)
 *  - `playerId` — the player to update
 *
 * The image is resized to 500 × 500 px using Lanczos3 neural-quality
 * resampling and stored in the database.
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

  await db
    .update(players)
    .set({ avatarData: processed.buffer })
    .where(eq(players.id, playerId));

  return NextResponse.json({
    success: true,
    data: {
      width: processed.width,
      height: processed.height,
      mimeType: processed.mimeType,
    },
  });
}
