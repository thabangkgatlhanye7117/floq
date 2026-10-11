import { redirect } from "next/navigation";
import { getSupabase } from "./supabase/server";
import { getAdmin } from "./admin";

export type Role = "scanner" | "owner";
export type Member = { userId: string; email: string; orgId: string; orgName: string; role: Role };

/** The signed-in user's organisation and role, or null if signed out / not linked to an organisation. */
export async function getMember(): Promise<Member | null> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  if (!user) return null;

  const { data } = await getAdmin()
    .from("org_members")
    .select("org_id, role, organisations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const org: any = (data as any).organisations;
  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: data.org_id,
    orgName: (Array.isArray(org) ? org[0]?.name : org?.name) ?? "Organisation",
    role: data.role as Role,
  };
}

/** For pages: send people away unless they hold one of the allowed roles. */
export async function requireMember(roles: Role[]): Promise<Member> {
  const m = await getMember();
  if (!m) redirect("/login");
  if (!roles.includes(m.role)) redirect(m.role === "owner" ? "/dashboard" : "/scan");
  return m;
}
