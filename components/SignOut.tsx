"use client";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function SignOut({ className = "btn line sm" }: { className?: string }) {
  async function out() {
    await getBrowserSupabase().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button className={className} onClick={out}>
      Sign out
    </button>
  );
}
