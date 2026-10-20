import crypto from "crypto";
import { promisify } from "util";

// Async scrypt keeps the event loop free while hashing under login floods.
const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Unambiguous alphabet: no 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const JOIN_CODE_LENGTH = 6;
export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_SECONDS = 15 * 60;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generatePin(): string {
  return String(crypto.randomInt(10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
}

/** Returns `salt:hash` (hex). */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pin, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pin, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
