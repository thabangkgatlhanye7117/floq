import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sends each person to the right place for their role. */
export default async function Home() {
  const m = await getMember();
  if (!m) redirect("/login");
  redirect(m.role === "owner" ? "/dashboard" : "/scan");
}
