import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { fetchAll } from "@/lib/db";
import { getHeadcount, type Headcount } from "@/lib/headcount";
import { summariseSurvey } from "@/lib/survey";
import AppBar from "@/components/AppBar";
import Live from "./Live";
import QuestionChart from "@/components/QuestionChart";

export const dynamic = "force-dynamic";

const TZ = "Africa/Johannesburg";
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-ZA", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
      })
    : "Date to be confirmed";

export default async function Dashboard({ searchParams }: { searchParams: { event?: string } }) {
  const m = await requireMember(["owner"]);
  const db = getAdmin();

  const { data: eventRows } = await db
    .from("events")
    .select("id, name, slug, brand, starts_at")
    .eq("org_id", m.orgId)
    .order("starts_at", { ascending: true });
  const events: any[] = eventRows ?? [];

  // default to the event happening now or next
  const now = Date.now();
  const current = events.find((e) => e.starts_at && Date.parse(e.starts_at) >= now - 12 * 3600e3) ?? events[0];
  const ev = events.find((e) => e.slug === searchParams.event) ?? current;

  const since7 = new Date(now - 7 * 864e5).toISOString();
  const subs = () => db.from("subs").select("id", { count: "exact", head: true }).eq("org_id", m.orgId);

  const [active, new7, unsub, sourceRows, surveyRows, msgCount, msgLatest] = await Promise.all([
    subs().eq("marketing_consent", true).is("unsubscribed_at", null),
    subs().eq("marketing_consent", true).is("unsubscribed_at", null).gte("created_at", since7),
    subs().not("unsubscribed_at", "is", null),
    fetchAll<any>((a, b) =>
      db.from("subs").select("utm_source").eq("org_id", m.orgId).eq("marketing_consent", true)
        .is("unsubscribed_at", null).order("id").range(a, b)
    ),
    ev
      ? fetchAll<any>((a, b) =>
          db.from("survey_responses").select("answers").eq("org_id", m.orgId).eq("event_id", ev.id).order("id").range(a, b)
        )
      : Promise.resolve([] as any[]),
    db.from("contact_messages").select("id", { count: "exact", head: true }).eq("org_id", m.orgId),
    db.from("contact_messages").select("name, email, subject, message, created_at")
      .eq("org_id", m.orgId).order("created_at", { ascending: false }).limit(5),
  ]);

  let hc: Headcount | null = null;
  if (ev) {
    try {
      hc = await getHeadcount(ev.id);
    } catch {
      hc = null; // door_scans not created yet
    }
  }

  const questions = summariseSurvey(surveyRows);

  const bySource = new Map<string, number>();
  for (const r of sourceRows) {
    const k = r.utm_source || "direct / unknown";
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }
  const sources = Array.from(bySource.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const topSource = sources[0]?.[1] ?? 1;

  return (
    <div className="wrap">
      <AppBar m={m} />

      <p className="eyebrow">{m.orgName}</p>
      <div className="events">
        {events.map((e) => (
          <Link key={e.id} href={`/dashboard?event=${e.slug}`} className={"chip" + (ev && e.id === ev.id ? " on" : "")}>
            {e.name}
          </Link>
        ))}
      </div>

      {!ev ? (
        <div className="card">
          <p className="empty">No events found for this organisation yet.</p>
        </div>
      ) : (
        <>
          <h1>{ev.name}</h1>
          <p className="lede" style={{ marginTop: 8 }}>{when(ev.starts_at)}</p>

          <section>
            <div className="grid g2">
              <Live slug={ev.slug} initial={hc} />
              <div className="grid g2" style={{ alignContent: "start" }}>
                <div className="card">
                  <h2>Survey responses</h2>
                  <div className="stat">{surveyRows.length}</div>
                  <p className="sub">for this event</p>
                </div>
                <div className="card">
                  <h2>On the mailing list</h2>
                  <div className="stat">{active.count ?? 0}</div>
                  <p className="sub">+{new7.count ?? 0} in the last 7 days</p>
                </div>
                <div className="card">
                  <h2>Unsubscribed</h2>
                  <div className="stat">{unsub.count ?? 0}</div>
                  <p className="sub">removed themselves</p>
                </div>
                <div className="card">
                  <h2>Messages</h2>
                  <div className="stat">{msgCount.count ?? 0}</div>
                  <p className="sub">through the contact form</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2>Who is coming (pre-event survey)</h2>
            {questions.length === 0 ? (
              <div className="card">
                <p className="empty">No survey answers for this event yet.</p>
              </div>
            ) : (
              <>
                <p className="sub" style={{ marginBottom: 14 }}>
                  Percentages are out of the people who answered each question. Multi-choice questions add up to more
                  than 100%. Only people who completed the survey are counted, so say "of {surveyRows.length} respondents"
                  when you share these numbers.
                </p>
                <div className="grid g2">
                  {questions.map((q) => (
                    <div className="card" key={q.key}>
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

          <section>
            <div className="grid g2">
              <div className="card">
                <h2>Where sign-ups came from</h2>
                {sources.length === 0 ? (
                  <p className="empty">No sign-ups yet.</p>
                ) : (
                  sources.map(([name, n]) => (
                    <div className="row" key={name}>
                      <div className="row-top">
                        <span>{name}</span>
                        <span>{n}</span>
                      </div>
                      <div className="track">
                        <div className="fill" style={{ width: `${(n / topSource) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
                <p className="sub" style={{ marginTop: 14 }}>
                  From the link tags on shared links (utm_source). "direct / unknown" means no tag.
                </p>
              </div>

              <div className="card">
                <h2>Latest messages</h2>
                {(msgLatest.data ?? []).length === 0 ? (
                  <p className="empty">No messages yet.</p>
                ) : (
                  <ul className="list">
                    {(msgLatest.data ?? []).map((r: any, i: number) => (
                      <li key={i}>
                        <strong>{r.subject || "Message"}</strong> from {r.name || "someone"}
                        <div className="meta">
                          {r.email} &middot; {when(r.created_at)}
                        </div>
                        <div>{String(r.message || "").slice(0, 140)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
