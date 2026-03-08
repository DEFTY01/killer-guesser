import { z } from "zod";

// ── Admin auth ────────────────────────────────────────────────────

export const adminLoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// ── Player registration ───────────────────────────────────────────

export const playerRegisterSchema = z.object({
  nickname: z
    .string()
    .min(2, "Nickname must be at least 2 characters")
    .max(24, "Nickname must be at most 24 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nickname may only contain letters, numbers, _ and -"),
});

export type PlayerRegisterInput = z.infer<typeof playerRegisterSchema>;

// ── Avatar upload ─────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const avatarUploadSchema = z.object({
  size: z.number().max(MAX_FILE_SIZE, "File must be smaller than 5 MB"),
  type: z.enum(ALLOWED_TYPES as [string, ...string[]], {
    error: "Only JPEG, PNG, WebP, and GIF are allowed",
  }),
});

export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

// ── Game creation ─────────────────────────────────────────────────

export const createGameSchema = z.object({
  code: z
    .string()
    .length(6, "Game code must be exactly 6 characters")
    .regex(/^[A-Z0-9]+$/, "Game code must be uppercase alphanumeric"),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
