import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-only, and only ever used AFTER getMember() has
 * confirmed who is asking and which organisation they belong to. Every query
 * made with it must be filtered by that organisation.
 */
export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
