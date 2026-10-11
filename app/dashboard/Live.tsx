"use client";
import { useEffect, useState } from "react";
import type { Headcount } from "@/lib/headcount";

const TZ = "Africa/Johannesburg";
const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** Live headcount. Refreshes every 5 seconds and says so plainly when it can't reach the server. */
export default function Live({ slug, initial }: { slug: string; initial: Headcount | null }) {
  const [hc, setHc] = useState<Headcount | null>(initial);
  const [online, setOnline] = useState(true);
  const [updated, setUpdated] = useState<string | null>(initial ? new Date().toISOString() : null);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const r = await fetch(`/api/headcount?event=${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data: Headcount = await r.json();
        if (stop) return;
        setHc(data);
        setOnline(true);
        setUpdated(new Date().toISOString());
      } catch {
        if (!stop) setOnline(false);
      }
    }
    setHc(initial);
    pull();
    const id = setInterval(pull, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [slug, initial]);

  const buckets = hc ? hc.buckets.slice(-48) : [];
  const max = Math.max(1, ...buckets.map((b) => b.n));

  return (
    <div className="card hero">
      <h2>
        <span className={"pulse" + (online ? "" : " off")} />
        Live headcount
      </h2>
      {!hc ? (
        <p>Gate scanning isn't switched on for this event yet.</p>
      ) : (
        <>
          <div className="big">{hc.total}</div>
          <p className="sub">people through the gate</p>
          <div className="live-row">
            <div>
              <strong>{hc.last15}</strong>arrived in the last 15 min
            </div>
            <div>
              <strong>{hc.rescans}</strong>re-scans (not counted)
            </div>
            <div>
              <strong>{hc.lastScanAt ? hm(hc.lastScanAt) : "-"}</strong>last scan
            </div>
          </div>
          {buckets.length > 1 && (
            <>
              <div className="curve" aria-label="Arrivals per 15 minutes">
                {buckets.map((b) => (
                  <i key={b.t} title={`${hm(b.t)}: ${b.n} arrived`} style={{ height: `${Math.max(3, (b.n / max) * 100)}%` }} />
                ))}
              </div>
              <div className="curve-axis">
                <span>{hm(buckets[0].t)}</span>
                <span>arrivals per 15 min</span>
                <span>{hm(buckets[buckets.length - 1].t)}</span>
              </div>
            </>
          )}
        </>
      )}
      <p className="sub" style={{ marginTop: 16 }}>
        {online
          ? updated
            ? `Updated ${hm(updated)}`
            : "Connecting..."
          : `Can't reach the server. Showing the last update${updated ? ` from ${hm(updated)}` : ""}.`}
      </p>
    </div>
  );
}
