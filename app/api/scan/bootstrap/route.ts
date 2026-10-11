import { NextResponse } from "next/server";
import { getMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { fetchAll } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Everything the scanner needs to work offline: the event's valid tag codes and the codes already scanned. */
export async function GET(request: Request) {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdmin();

  const { data: rows } = await db
    .from("events")
    .select("id, name, slug, starts_at")
    .eq("org_id", m.orgId)
    .order("starts_at", { ascending: true });
  const events = (rows ?? []) as { id: string; name: string; slug: string; starts_at: string | null }[];
  if (!events.length) return NextResponse.json({ error: "No events" }, { status: 404 });

  const slug = new URL(request.url).searchParams.get("event");
  const now = Date.now();
  const current = events.find((e) => e.starts_at && Date.parse(e.starts_at) >= now - 12 * 3600e3) ?? events[0];
  const ev = events.find((e) => e.slug === slug) ?? current;

  try {
    const [tags, scans] = await Promise.all([
      fetchAll<{ code: string }>((a, b) =>
        db.from("tags").select("code").eq("org_id", m.orgId).eq("event_id", ev.id).order("code").range(a, b)
      ),
      fetchAll<{ tag_code: string }>((a, b) =>
        db.from("door_scans").select("tag_code").eq("org_id", m.orgId).eq("event_id", ev.id).order("id").range(a, b)
      ),
    ]);
    return NextResponse.json(
      {
        events: events.map((e) => ({ slug: e.slug, name: e.name })),
        event: { slug: ev.slug, name: ev.name },
        codes: tags.map((t) => t.code),
        scanned: Array.from(new Set(scans.map((s) => s.tag_code))),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("scan bootstrap error", e);
    return NextResponse.json({ error: "Could not load tags" }, { status: 500 });
  }
}
