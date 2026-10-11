import { NextResponse } from "next/server";
import { getMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { getHeadcount } from "@/lib/headcount";

export const dynamic = "force-dynamic";

/** Live headcount for one of the caller's own events. */
export async function GET(request: Request) {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const slug = new URL(request.url).searchParams.get("event") || "";
  const { data: ev } = await getAdmin()
    .from("events")
    .select("id")
    .eq("slug", slug)
    .eq("org_id", m.orgId) // never serve another organisation's event
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  try {
    return NextResponse.json(await getHeadcount(ev.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("headcount error", e);
    return NextResponse.json({ error: "Could not read scans" }, { status: 500 });
  }
}
