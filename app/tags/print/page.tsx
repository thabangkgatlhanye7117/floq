import QRCode from "qrcode";
import { requireMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { fetchAll } from "@/lib/db";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** Printable sheet: one QR per tag. Always black on white, whatever the theme. */
export default async function PrintSheet({ searchParams }: { searchParams: { event?: string } }) {
  const m = await requireMember(["owner"]);
  const db = getAdmin();
  const { data: ev } = await db
    .from("events")
    .select("id, name, brand")
    .eq("org_id", m.orgId)
    .eq("slug", searchParams.event ?? "")
    .maybeSingle();
  if (!ev) return <div className="wrap"><p className="empty" style={{ marginTop: 40 }}>Event not found.</p></div>;

  const tags = await fetchAll<{ code: string }>((a, b) =>
    db.from("tags").select("code").eq("org_id", m.orgId).eq("event_id", ev.id).order("created_at").order("code").range(a, b)
  );
  const svgs = await Promise.all(
    tags.map((t) => QRCode.toString(t.code, { type: "svg", margin: 0, errorCorrectionLevel: "M" }))
  );

  return (
    <div className="sheet-page">
      <div className="noprint sheet-head">
        <div>
          <strong>{ev.name}</strong>
          <div className="sub">{tags.length} tags. Print at 100% / actual size, on A4. Each tag is about 38 x 44 mm: cut along the dotted lines.</div>
        </div>
        <PrintButton />
      </div>
      <div className="sheet">
        {tags.map((t, i) => (
          <div className="tag" key={t.code}>
            <div className="tag-qr" dangerouslySetInnerHTML={{ __html: svgs[i] }} />
            <div className="tag-code">{t.code}</div>
            <div className="tag-ev">{ev.brand || "KWA GOGO"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
