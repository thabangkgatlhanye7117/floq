import { NextResponse } from "next/server";
import { getMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { genCode } from "@/lib/tags";

export const dynamic = "force-dynamic";

/** Owner only: create `count` new tag codes for one of their events. */
export async function POST(request: Request) {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (m.role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const count = Math.floor(Number(body?.count));
  if (!(count >= 1 && count <= 3000)) return NextResponse.json({ error: "Enter a number from 1 to 3000" }, { status: 400 });

  const db = getAdmin();
  const { data: ev } = await db.from("events").select("id").eq("org_id", m.orgId).eq("slug", String(body?.event ?? "")).maybeSingle();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const codes = new Set<string>();
  while (codes.size < count) codes.add(genCode());
  const rows = Array.from(codes).map((code) => ({ code, org_id: m.orgId, event_id: ev.id }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("tags").insert(rows.slice(i, i + 500));
    if (error) {
      console.error("tag insert error", error);
      return NextResponse.json({ error: "Could not save tags. Try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ created: count });
}
