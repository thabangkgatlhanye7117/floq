import { NextResponse } from "next/server";
import { getMember } from "@/lib/auth";
import { getAdmin } from "@/lib/admin";
import { normCode } from "@/lib/tags";

export const dynamic = "force-dynamic";

type In = { id?: unknown; ev?: unknown; code?: unknown; at?: unknown };

/**
 * Saves scans the phone collected (possibly while offline).
 * - Safe to send twice: client_scan_id is unique, repeats are ignored.
 * - Codes that are not real tags for the event are rejected, so they can never inflate the headcount.
 * Replies with `done`: the ids the phone can now forget (saved, repeated or rejected).
 */
export async function POST(request: Request) {
  const m = await getMember();
  if (!m) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const scans: In[] = Array.isArray(body?.scans) ? body.scans.slice(0, 500) : [];
  if (!scans.length) return NextResponse.json({ done: [], rejected: [] });

  const db = getAdmin();
  const slugs = Array.from(new Set(scans.map((s) => String(s.ev ?? ""))));
  const { data: evs } = await db.from("events").select("id, slug").eq("org_id", m.orgId).in("slug", slugs);
  const idBySlug = new Map((evs ?? []).map((e: any) => [e.slug as string, e.id as string]));

  const done: string[] = [];
  const rejected: string[] = [];
  const now = Date.now();

  for (const slug of slugs) {
    const eventId = idBySlug.get(slug);
    const mine = scans.filter((s) => String(s.ev ?? "") === slug);
    if (!eventId) {
      mine.forEach((s) => s.id && done.push(String(s.id))); // unknown event: drop, nothing sensible to do with it
      continue;
    }

    const codes = Array.from(new Set(mine.map((s) => normCode(s.code)).filter(Boolean)));
    const { data: valid } = await db.from("tags").select("code").eq("org_id", m.orgId).eq("event_id", eventId).in("code", codes);
    const ok = new Set((valid ?? []).map((t: any) => t.code as string));

    const rows: any[] = [];
    for (const s of mine) {
      const id = String(s.id ?? "").slice(0, 64);
      if (!id) continue;
      const code = normCode(s.code);
      if (!ok.has(code)) {
        rejected.push(code);
        done.push(id);
        continue;
      }
      let t = Date.parse(String(s.at));
      if (!Number.isFinite(t) || t > now + 5 * 60e3) t = now; // a wrong phone clock must not put scans in the future
      rows.push({
        org_id: m.orgId,
        event_id: eventId,
        tag_code: code,
        client_scan_id: id,
        scanned_at: new Date(t).toISOString(),
        scanned_by: m.userId,
      });
      done.push(id);
    }

    if (rows.length) {
      const { error } = await db.from("door_scans").upsert(rows, { onConflict: "client_scan_id", ignoreDuplicates: true });
      if (error) {
        console.error("scan sync error", error);
        return NextResponse.json({ error: "Could not save scans" }, { status: 500 }); // nothing marked done: phone keeps them and retries
      }
    }
  }

  return NextResponse.json({ done, rejected });
}
