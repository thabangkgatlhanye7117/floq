import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { fetchAll } from "@/lib/db";
import AppBar from "@/components/AppBar";
import GenerateTags from "@/components/GenerateTags";

export const dynamic = "force-dynamic";

/** Owner page: create the QR tag codes for an event, then open the print sheet. */
export default async function Tags({ searchParams }: { searchParams: { event?: string } }) {
  const m = await requireMember(["owner"]);
  const db = getAdmin();
  const { data } = await db.from("events").select("id, name, slug, starts_at").eq("org_id", m.orgId).order("starts_at", { ascending: true });
  const events = (data ?? []) as { id: string; name: string; slug: string; starts_at: string | null }[];

  const rows = await fetchAll<{ event_id: string }>((a, b) =>
    db.from("tags").select("event_id").eq("org_id", m.orgId).order("code").range(a, b)
  );
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1));
  const list = events.map((e) => ({ slug: e.slug, name: e.name, tags: counts.get(e.id) ?? 0 }));

  const now = Date.now();
  const current = events.find((e) => e.starts_at && Date.parse(e.starts_at) >= now - 12 * 3600e3) ?? events[0];
  const initial = events.find((e) => e.slug === searchParams.event)?.slug ?? current?.slug ?? "";

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <AppBar m={m} />
      <p className="eyebrow">Gate tags</p>
      <h1 style={{ margin: "6px 0 10px" }}>Tags</h1>
      <p className="lede" style={{ marginBottom: 20 }}>
        Each tag has its own QR code and a short code underneath. Create more than you expect people, then print the sheet.
      </p>

      <div className="card">
        {list.length === 0 ? <p className="empty">No events yet.</p> : <GenerateTags events={list} initial={initial} />}
      </div>

      <section>
        <h2>Print sheets</h2>
        <div className="card">
          {list.map((e) => (
            <div key={e.slug} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span>
                {e.name} <span style={{ color: "var(--muted)" }}>&middot; {e.tags} tags</span>
              </span>
              {e.tags > 0 ? (
                <Link className="btn line sm" href={`/tags/print?event=${e.slug}`}>
                  Open sheet
                </Link>
              ) : (
                <span className="sub" style={{ margin: 0 }}>none yet</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
