import { randomBytes } from "crypto";

// 32 characters, no 0/O/1/I, so a code read out loud or typed by hand is hard to get wrong.
const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random 8-character tag code, e.g. "K7Q2XM4B". 32^8 combinations, so guessing one is hopeless. */
export function genCode(): string {
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += A[b[i] % 32]; // 256 is a multiple of 32, so every character is equally likely
  return s;
}

/** Tidy what a scanner or a human typed: upper case, letters and digits only. */
export const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
