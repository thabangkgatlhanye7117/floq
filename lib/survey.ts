/** Survey answers -> counts per question. Works on the jsonb `answers` column: { age: ["25-34"], drinks: ["Beer","Cider"], ... } */

export const QUESTION_LABELS: Record<string, string> = {
  age: "Age",
  area: "Where they're coming from",
  visits: "Been to a KWA GOGO or SKYFALL event before?",
  group: "Group size",
  arrive: "Planned arrival",
  food: "Food they want",
  drinks: "What they'll drink",
  spend: "Expected spend (besides ticket)",
  music: "Music they want",
};

// Questions whose options have a natural order; everything else sorts by popularity.
const ORDER: Record<string, string[]> = {
  age: ["18-24", "25-34", "35-44", "45+"],
  visits: ["First time", "Once or twice", "Regular"],
  group: ["Just me", "2-3 people", "4-6 people", "7 or more"],
  arrive: ["When doors open", "1-2 hours after doors", "3+ hours after doors", "Not sure yet"],
  spend: ["Under R150", "R150-R300", "R300-R600", "R600+"],
};

/** Which chart suits each question. ordered scales -> columns, small share-of-whole -> donut, the rest -> ranked bars. */
export type ChartKind = "column" | "donut" | "bars";
const KIND: Record<string, ChartKind> = {
  age: "column",
  group: "column",
  arrive: "column",
  spend: "column",
  visits: "donut",
};

export type QuestionSummary = {
  key: string;
  kind: ChartKind;
  label: string;
  multi: boolean;
  respondents: number;
  options: { label: string; count: number; pct: number }[];
};

export function summariseSurvey(rows: { answers: any }[]): QuestionSummary[] {
  const byKey = new Map<string, { respondents: number; counts: Map<string, number>; multi: boolean }>();

  for (const r of rows) {
    const a = r.answers;
    if (!a || typeof a !== "object") continue;
    for (const [key, raw] of Object.entries(a)) {
      const vals = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
      if (!vals.length) continue;
      let q = byKey.get(key);
      if (!q) byKey.set(key, (q = { respondents: 0, counts: new Map(), multi: false }));
      q.respondents++;
      if (vals.length > 1) q.multi = true;
      for (const v of vals) q.counts.set(v, (q.counts.get(v) ?? 0) + 1);
    }
  }

  const known = Object.keys(QUESTION_LABELS).filter((k) => byKey.has(k));
  const extra = Array.from(byKey.keys()).filter((k) => !(k in QUESTION_LABELS));

  return [...known, ...extra].map((key) => {
    const q = byKey.get(key)!;
    const order = ORDER[key];
    const options = Array.from(q.counts.entries())
      .map(([label, count]) => ({ label, count, pct: Math.round((count / q.respondents) * 100) }))
      .sort((x, y) => {
        if (order) {
          const ix = order.indexOf(x.label), iy = order.indexOf(y.label);
          if (ix !== -1 || iy !== -1) return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
        }
        return y.count - x.count;
      });
    let kind: ChartKind = KIND[key] ?? "bars";
    // a donut only makes sense for single-choice with a few slices; multi-choice adds up to more than 100%
    if (q.multi || (kind === "donut" && options.length > 4)) kind = kind === "column" ? "column" : "bars";
    if (q.multi && kind === "column") kind = "bars";
    return { key, kind, label: QUESTION_LABELS[key] ?? key, multi: q.multi, respondents: q.respondents, options };
  });
}
