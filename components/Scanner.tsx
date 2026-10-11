"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Ev = { slug: string; name: string };
type Queued = { id: string; ev: string; code: string; at: string };
type Result = { kind: "ok" | "dup" | "bad"; code: string; title: string; sub: string } | null;

const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const QKEY = "bs_scan_queue";
const loadQueue = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(QKEY) || "[]");
  } catch {
    return [];
  }
};
const saveQueue = (q: Queued[]) => {
  try {
    localStorage.setItem(QKEY, JSON.stringify(q));
  } catch {}
};

/**
 * Gate scanner. Offline-first:
 *  - on load it downloads the event's valid tag codes and the codes already scanned;
 *  - every scan is checked against that list on the phone, so it answers instantly with no signal;
 *  - scans are saved on the phone and sent to the server whenever there is a connection.
 * Keep this page open at the gate. Reloading while offline would need a connection to bring the page back.
 */
export default function Scanner() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [ev, setEv] = useState<Ev | null>(null);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [through, setThrough] = useState(0);
  const [mine, setMine] = useState(0);
  const [result, setResult] = useState<Result>(null);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [typed, setTyped] = useState("");

  const codes = useRef<Set<string>>(new Set());
  const scanned = useRef<Set<string>>(new Set());
  const queue = useRef<Queued[]>([]);
  const evRef = useRef<Ev | null>(null);
  const last = useRef({ code: "", t: 0 });
  const syncing = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const audio = useRef<AudioContext | null>(null);

  const refreshCounts = () => {
    setPending(queue.current.length);
    setThrough(scanned.current.size);
  };

  /* ---- load the event's tag list (and refresh it every 20 s while online) ---- */
  const boot = useCallback(async (slug?: string) => {
    try {
      const r = await fetch(`/api/scan/bootstrap${slug ? `?event=${encodeURIComponent(slug)}` : ""}`, { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      codes.current = new Set<string>(j.codes);
      // keep anything scanned on this phone that the server hasn't seen yet
      const next = new Set<string>(j.scanned);
      queue.current.filter((q) => q.ev === j.event.slug).forEach((q) => next.add(q.code));
      scanned.current = next;
      evRef.current = j.event;
      setEvents(j.events);
      setEv(j.event);
      setOnline(true);
      setLoadErr("");
      setReady(true);
      refreshCounts();
      try {
        localStorage.setItem("bs_scan_boot", JSON.stringify(j));
      } catch {}
    } catch {
      // no signal: fall back to the copy saved last time
      try {
        const j = JSON.parse(localStorage.getItem("bs_scan_boot") || "null");
        if (j && !evRef.current) {
          codes.current = new Set<string>(j.codes);
          const next = new Set<string>(j.scanned);
          queue.current.forEach((q) => next.add(q.code));
          scanned.current = next;
          evRef.current = j.event;
          setEvents(j.events);
          setEv(j.event);
          setReady(true);
          refreshCounts();
        } else if (!evRef.current) setLoadErr("Can't reach the server and nothing is saved on this phone yet. Get a signal and reload.");
      } catch {
        if (!evRef.current) setLoadErr("Can't reach the server. Get a signal and reload.");
      }
      setOnline(false);
    }
  }, []);

  /* ---- send saved scans to the server ---- */
  const sync = useCallback(async () => {
    if (syncing.current || !queue.current.length) return;
    syncing.current = true;
    try {
      const batch = queue.current.slice(0, 200);
      const r = await fetch("/api/scan/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scans: batch }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const done = new Set<string>(j.done);
      queue.current = queue.current.filter((q) => !done.has(q.id));
      saveQueue(queue.current);
      setOnline(true);
      refreshCounts();
    } catch {
      setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    queue.current = loadQueue();
    try {
      setMine(Number(localStorage.getItem("bs_scan_mine") || 0));
    } catch {}
    boot();
    sync();
    const t1 = setInterval(sync, 4000);
    const t2 = setInterval(() => boot(evRef.current?.slug), 20000);
    const up = () => {
      sync();
      boot(evRef.current?.slug);
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      stopCam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- feedback ---- */
  function beep(kind: "ok" | "dup" | "bad") {
    try {
      const ctx = audio.current;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = kind === "ok" ? 880 : kind === "dup" ? 520 : 220;
      g.gain.value = 0.12;
      o.start();
      o.stop(ctx.currentTime + (kind === "bad" ? 0.35 : 0.14));
    } catch {}
  }

  /* ---- one scan, from the camera or typed ---- */
  function handle(raw: string) {
    const code = norm(raw);
    const e = evRef.current;
    if (!code || !e) return;
    const now = Date.now();
    if (last.current.code === code && now - last.current.t < 2500) return; // same tag still in view
    last.current = { code, t: now };

    let kind: "ok" | "dup" | "bad";
    if (!codes.current.has(code)) {
      kind = "bad";
      setResult({ kind, code, title: "Not a valid tag", sub: "Do not count. Check it is an event tag." });
    } else if (scanned.current.has(code)) {
      kind = "dup";
      queue.current.push({ id: uid(), ev: e.slug, code, at: new Date().toISOString() }); // saved as a re-scan, not counted twice
      saveQueue(queue.current);
      setResult({ kind, code, title: "Already scanned", sub: "This tag has been through the gate." });
    } else {
      kind = "ok";
      scanned.current.add(code);
      queue.current.push({ id: uid(), ev: e.slug, code, at: new Date().toISOString() });
      saveQueue(queue.current);
      setMine((n) => {
        try {
          localStorage.setItem("bs_scan_mine", String(n + 1));
        } catch {}
        return n + 1;
      });
      setResult({ kind, code, title: "Welcome", sub: "Counted." });
    }
    try {
      navigator.vibrate?.(kind === "ok" ? 60 : [90, 60, 90]);
    } catch {}
    beep(kind);
    refreshCounts();
    if (kind !== "bad") sync();
  }

  /* ---- camera ---- */
  function stopCam() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function startCam() {
    setCamErr("");
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC && !audio.current) audio.current = new AC(); // created on a tap so phones allow sound
    } catch {}
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setCamOn(true);
      try {
        await (navigator as any).wakeLock?.request("screen"); // keep the screen awake
      } catch {}
      let lastTick = 0;
      const loop = (t: number) => {
        raf.current = requestAnimationFrame(loop);
        if (t - lastTick < 110 || v.readyState < 2 || !v.videoWidth) return;
        lastTick = t;
        const c = canvas.current!;
        const w = Math.min(640, v.videoWidth);
        const h = Math.round((v.videoHeight / v.videoWidth) * w);
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const hit = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (hit?.data) handle(hit.data);
      };
      raf.current = requestAnimationFrame(loop);
    } catch (e: any) {
      setCamErr(
        e?.name === "NotAllowedError"
          ? "Camera is blocked. Allow the camera for this site in the browser settings, then tap Start camera."
          : "Could not start the camera. You can still type tag codes below."
      );
    }
  }

  function typedSubmit(e: React.FormEvent) {
    e.preventDefault();
    handle(typed);
    setTyped("");
  }

  async function switchEvent(slug: string) {
    setReady(false);
    setResult(null);
    await boot(slug);
  }

  if (loadErr) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <p className="err">{loadErr}</p>
      </div>
    );
  }
  if (!ready || !ev) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <p className="empty">Loading tags...</p>
      </div>
    );
  }

  const noTags = codes.current.size === 0;

  return (
    <div className="scan">
      <div className="scan-top">
        {events.length > 1 ? (
          <select className="scan-select" value={ev.slug} onChange={(e) => switchEvent(e.target.value)} aria-label="Event">
            {events.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
        ) : (
          <strong>{ev.name}</strong>
        )}
        <span className={"pill " + (online ? "ok" : "warn")}>{online ? "Online" : "Offline: saving on this phone"}</span>
      </div>

      <div className="scan-stats">
        <div>
          <strong>{through}</strong>through the gate
        </div>
        <div>
          <strong>{mine}</strong>scanned on this phone
        </div>
        <div>
          <strong>{pending}</strong>waiting to sync
        </div>
      </div>

      {noTags && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="err" style={{ marginTop: 0 }}>
            No tags have been created for this event yet. An owner can create them under Tags.
          </p>
        </div>
      )}

      <div className="scan-cam">
        <video ref={video} playsInline muted />
        <canvas ref={canvas} style={{ display: "none" }} />
        {camOn && <div className="scan-frame" />}
        {!camOn && (
          <button className="btn scan-start" onClick={startCam}>
            Start camera
          </button>
        )}
      </div>
      {camErr && <p className="err">{camErr}</p>}

      <div className={"scan-res " + (result ? result.kind : "idle")} aria-live="assertive">
        {result ? (
          <>
            <div className="scan-res-t">{result.title}</div>
            <div className="scan-res-s">
              {result.code} &middot; {result.sub}
            </div>
          </>
        ) : (
          <div className="scan-res-s">Point the camera at a tag QR code.</div>
        )}
      </div>

      <form className="scan-type" onSubmit={typedSubmit}>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type the tag code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Tag code"
        />
        <button className="btn" type="submit" disabled={!typed.trim()}>
          Add
        </button>
      </form>
      <p className="sub" style={{ marginTop: 14 }}>
        Keep this page open at the gate. With no signal, scans are kept on the phone and sent automatically when it
        reconnects. Do not clear the browser data until "waiting to sync" is 0.
      </p>
    </div>
  );
}
