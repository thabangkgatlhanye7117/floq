import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { fetchAll } from "@/lib/db";
import { getHeadcount, type Headcount } from "@/lib/headcount";
import { summariseSurvey } from "@/lib/survey";
import QuestionChart from "@/components/QuestionChart";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const TZ = "Africa/Johannesburg";
const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

/** The time by which 25/50/75/90% of the crowd had arrived, to the nearest 15 minutes (end of that slot). */
function milestones(hc: Headcount) {
  const targets = [25, 50, 75, 90];
  const out: { pct: number; by: string }[] = [];
  let cum = 0;
  let i = 0;
  for (const b of hc.buckets) {
    cum += b.n;
    while (i < targets.length && cum >= (targets[i] / 100) * hc.total) {
      out.push({ pct: targets[i], by: new Date(Date.parse(b.t) + 15 * 60e3).toISOString() });
      i++;
    }
  }
  return out;
}

function ArrivalChart({ hc }: { hc: Headcount }) {
  const b = hc.buckets;
  const n = b.length;
  const W = 720, H = 170, base = 140, top = 14;
  const max = Math.max(1, ...b.map((x) => x.n));
  const slot = W / Math.max(n, 1);
  const bw = Math.max(2, slot - 3);
  const peak = b.reduce((p, x, i) => (x.n > b[p].n ? i : p), 0);
  const every = Math.max(1, Math.ceil(n / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="People arriving at the gate, per 15 minutes" className="r-arrivals">
      <line x1="0" x2={W} y1={base} y2={base} style={{ stroke: "var(--line)" }} />
      {b.map((x, i) => {
        const h = Math.max(2, (x.n / max) * (base - top));
        return (
          <g key={x.t}>
            <rect x={i * slot + 1.5} y={base - h} width={bw} height={h} rx="3" style={{ fill: "var(--accent)" }} fillOpacity={i === peak ? 1 : 0.4}>
              <title>{`${hm(x.t)}: ${x.n} arrived`}</title>
            </rect>
            {i % every === 0 && (
              <text x={i * slot + slot / 2} y={base + 18} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>
                {hm(x.t)}
              </text>
            )}
          </g>
        );
      })}
      <text x={peak * slot + slot / 2} y={Math.max(11, base - (b[peak].n / max) * (base - top) - 6)} textAnchor="middle" fontSize="12" fontWeight="600" style={{ fill: "var(--ink)" }}>
        {b[peak].n}
      </text>
    </svg>
  );
}

/** Sponsor report: one printable page set per event. Always black on white, whatever the theme. */
export default async function Report({ searchParams }: { searchParams: { event?: string } }) {
  const m = await requireMember(["owner"]);
  const db = getAdmin();

  const { data } = await db
    .from("events")
    .select("id, name, slug, brand, starts_at")
    .eq("org_id", m.orgId)
    .order("starts_at", { ascending: true });
  const events = (data ?? []) as { id: string; name: string; slug: string; brand: string | null; starts_at: string | null }[];
  const now = Date.now();
  const current = events.find((e) => e.starts_at && Date.parse(e.starts_at) >= now - 12 * 3600e3) ?? events[0];
  const ev = events.find((e) => e.slug === searchParams.event) ?? current;

  if (!ev) {
    return (
      <div className="report-page">
        <p className="empty">No events found.</p>
      </div>
    );
  }

  let hc: Headcount | null = null;
  try {
    hc = await getHeadcount(ev.id);
  } catch {
    hc = null;
  }
  const surveyRows = await fetchAll<any>((a, b) =>
    db.from("survey_responses").select("answers").eq("org_id", m.orgId).eq("event_id", ev.id).order("id").range(a, b)
  );
  const questions = summariseSurvey(surveyRows);

  const hasScans = !!hc && hc.total > 0;
  const ms = hasScans ? milestones(hc!) : [];
  const peakSlot = hasScans ? hc!.buckets.reduce((p, x) => (x.n > p.n ? x : p), hc!.buckets[0]) : null;
  const firstIn = hasScans ? hc!.buckets[0].t : null;

  return (
    <div className="report-page">
      <div className="noprint sheet-head">
        <div>
          <strong>Sponsor report: {ev.name}</strong>
          <div className="sub">
            Prints on A4. Use Print, then choose Save as PDF.{" "}
            {!hasScans && "No scans recorded for this event yet, so the attendance section is empty."} Card sales are not included
            yet; they are added once the sales file is loaded.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn line sm" href={`/dashboard?event=${ev.slug}`} style={{ color: "#000" }}>
            Back
          </Link>
          <PrintButton />
        </div>
      </div>

      <article className="report">
        <header className="r-head">
          <div className="r-eyebrow">{ev.brand || m.orgName} &middot; Audience report</div>
          <h1>{ev.name}</h1>
          {ev.starts_at && <div className="r-date">{dateLong(ev.starts_at)}</div>}
        </header>

        <section className="r-sec">
          <h2>Verified attendance</h2>
          {hasScans && hc ? (
            <>
              <div className="r-kpis">
                <div>
                  <strong>{hc.total}</strong>
                  <span>people through the gate</span>
                </div>
                <div>
                  <strong>{peakSlot ? peakSlot.n : 0}</strong>
                  <span>
                    arrived in the busiest 15 minutes
                    {peakSlot ? ` (${hm(peakSlot.t)} to ${hm(new Date(Date.parse(peakSlot.t) + 15 * 60e3).toISOString())})` : ""}
                  </span>
                </div>
                <div>
                  <strong>{firstIn ? hm(firstIn) : "-"}</strong>
                  <span>first arrivals</span>
                </div>
                <div>
                  <strong>{hc.lastScanAt ? hm(hc.lastScanAt) : "-"}</strong>
                  <span>last scan</span>
                </div>
              </div>
              <h3>Arrivals through the day</h3>
              <ArrivalChart hc={hc} />
              <p className="r-cap">People first scanned at the gate, per 15 minutes. The busiest slot is shown in full colour.</p>
              {ms.length > 0 && (
                <table className="r-table">
                  <thead>
                    <tr>
                      <th>Share of the crowd inside</th>
                      <th>By (to the nearest 15 minutes)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ms.map((x) => (
                      <tr key={x.pct}>
                        <td>{x.pct}%</td>
                        <td>{hm(x.by)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="empty">No gate scans were recorded for this event.</p>
          )}
        </section>

        <section className="r-sec">
          <h2>Who the audience says it is</h2>
          {questions.length === 0 ? (
            <p className="empty">No survey answers were collected for this event.</p>
          ) : (
            <>
              <p className="r-cap" style={{ marginTop: 0 }}>
                Based on <strong>{surveyRows.length}</strong> survey response{surveyRows.length === 1 ? "" : "s"}, answered online before the event by
                people who chose to take part. They are not linked to gate scans and may not match everyone who attended. Percentages are of the
                people who answered each question; multiple-choice questions add up to more than 100%.
              </p>
              <div className="r-grid">
                {questions.map((q) => (
                  <div className="r-card" key={q.key}>
                    <div className="q">
                      <h3>{q.label}</h3>
                      <small>
                        {q.respondents} answered{q.multi ? " · pick all that apply" : ""}
                      </small>
                      <QuestionChart q={q} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="r-sec r-notes">
          <h2>How these numbers were produced</h2>
          <ul>
            <li>
              <strong>Attendance.</strong> Each person is given one QR tag. The tag is scanned on entry and counted once, at its first scan.
              {hc && hc.rescans > 0 ? ` ${hc.rescans} repeat scans were recorded and not counted.` : " Repeat scans are recorded but not counted."}
            </li>
            <li>
              <strong>Timing.</strong> Each scan is saved with a unique ID and the time on the scanning phone. The full scan log is available on request.
            </li>
            <li>
              <strong>Survey.</strong> Self-reported by respondents, as described above.
            </li>
            <li>
              <strong>Not covered.</strong> This report does not show how long people stayed, or what any individual spent.
            </li>
          </ul>
          <p className="r-foot">
            Prepared for {m.orgName}. Generated {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: TZ })} at{" "}
            {hm(new Date().toISOString())}. Data collected with Bullasoft Platform.
          </p>
        </section>
      </article>
    </div>
  );
}
