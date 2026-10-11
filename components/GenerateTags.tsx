"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Ev = { slug: string; name: string; tags: number };

/** Owner form: create tag codes for an event. */
export default function GenerateTags({ events, initial }: { events: Ev[]; initial: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial);
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const cur = events.find((e) => e.slug === slug);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.floor(Number(count));
    if (!(n >= 1 && n <= 3000)) {
      setErr("Enter a number from 1 to 3000.");
      return;
    }
    if (cur && cur.tags > 0 && !confirm(`${cur.name} already has ${cur.tags} tags. Add ${n} more?`)) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/tags/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: slug, count: n }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      setMsg(`Created ${j.created} tags.`);
      setCount("");
      router.refresh();
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={go}>
      <label className="field">
        Event
        <select className="scan-select" style={{ width: "100%", marginTop: 6, padding: 13 }} value={slug} onChange={(e) => setSlug(e.target.value)}>
          {events.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.name} ({e.tags} tags)
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        How many tags to create
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 230" />
      </label>
      {err && <p className="err">{err}</p>}
      {msg && <p className="note" style={{ color: "var(--ok)" }}>{msg}</p>}
      <p style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={busy || !count}>
          {busy ? "Creating..." : "Create tags"}
        </button>
      </p>
    </form>
  );
}
