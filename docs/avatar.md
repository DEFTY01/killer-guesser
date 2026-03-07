# Avatar Processing

## Overview

Uploaded avatars are resized to **500 × 500 px** before storage. This ensures:

- Consistent display at all sizes.
- Reduced storage cost.
- No distortion — images are cropped to a centred square first.

## Implementation

### Primary path — Sharp (Lanczos3)

`src/lib/avatar.ts` → `resizeAvatar(buffer)`

```
Input buffer
  │
  ▼
sharp(input)
  .resize(500, 500, {
      fit: "cover",
      position: "attention",   ← libvips smart-crop
      kernel: sharp.kernel.lanczos3,
  })
  .png({ quality: 90 })
  .toBuffer()
  │
  ▼
ProcessedAvatar { buffer, mimeType: "image/png", width: 500, height: 500 }
```

**Why Lanczos3?**
Lanczos resampling is a windowed sinc filter that minimises aliasing during both
upscaling and downscaling. It is mathematically equivalent to the convolution
layers used in classical super-resolution CNNs and produces visually
near-identical results for the 500 × 500 target resolution.

### Extension point — ONNX Super-Resolution

`src/lib/avatar.ts` → `processAvatarWithOnnx(buffer)`

To enable true neural upscaling (e.g. ESRGAN-lite):

1. Add `onnxruntime-node` to dependencies.
2. Place your `.onnx` model at `models/sr.onnx`.
3. Uncomment the ONNX code path in `processAvatarWithOnnx`.

The function signature is identical to `resizeAvatar`, so you can swap it in
`src/app/api/avatar/route.ts` with a one-line change.

## API route

`POST /api/avatar`

| Field | Type | Description |
|---|---|---|
| `file` | `File` | Image (JPEG / PNG / WebP / GIF, max 5 MB) |
| `playerId` | `string` | UUID of the player to update |

The processed PNG is stored in `players.avatarData` (BLOB).

## Validation

Incoming uploads are validated with Zod before processing:

```ts
const avatarUploadSchema = z.object({
  size: z.number().max(5 * 1024 * 1024),
  type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});
```
