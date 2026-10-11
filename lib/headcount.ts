import { getAdmin } from "./admin";
import { fetchAll } from "./db";

export type Headcount = {
  total: number; // distinct tags scanned = people in
  rescans: number; // extra scans of tags already counted
  last15: number; // new arrivals in the last 15 minutes
  buckets: { t: string; n: number }[]; // arrivals per 15 minutes, by first scan
  lastScanAt: string | null;
};

const BUCKET = 15 * 60 * 1000;

/** Headcount for one event. A person counts once, at their first scan. */
export async function getHeadcount(eventId: string): Promise<Headcount> {
  const rows = await fetchAll<{ tag_code: string; scanned_at: string }>((a, b) =>
    getAdmin()
      .from("door_scans")
      .select("tag_code, scanned_at")
      .eq("event_id", eventId)
      .order("scanned_at", { ascending: true })
      .order("id", { ascending: true })
      .range(a, b)
  );

  const first = new Map<string, number>();
  let lastScan = 0;
  for (const r of rows) {
    const t = Date.parse(r.scanned_at);
    if (!first.has(r.tag_code)) first.set(r.tag_code, t);
    if (t > lastScan) lastScan = t;
  }

  const counts = new Map<number, number>();
  const now = Date.now();
  let last15 = 0;
  first.forEach((t) => {
    const k = Math.floor(t / BUCKET) * BUCKET;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (t >= now - BUCKET) last15++;
  });

  const keys = Array.from(counts.keys()).sort((x, y) => x - y);
  const buckets: { t: string; n: number }[] = [];
  if (keys.length) {
    // fill quiet quarter-hours with zero so the curve is continuous (capped at 48 hours)
    const start = Math.max(keys[0], keys[keys.length - 1] - 192 * BUCKET);
    for (let k = start; k <= keys[keys.length - 1]; k += BUCKET) {
      buckets.push({ t: new Date(k).toISOString(), n: counts.get(k) ?? 0 });
    }
  }

  return {
    total: first.size,
    rescans: rows.length - first.size,
    last15,
    buckets,
    lastScanAt: lastScan ? new Date(lastScan).toISOString() : null,
  };
}
