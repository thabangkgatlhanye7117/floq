import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Session-aware client for server components and route handlers (reads the login cookie). */
export function getSupabase() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list: { name: string; value: string; options?: any }[]) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // called from a server component: middleware refreshes the session instead
          }
        },
      },
    }
  );
}
