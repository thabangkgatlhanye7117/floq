import type { QuestionSummary } from "@/lib/survey";

// Slice colours come from CSS (--s1..--s4) so they switch with dark mode. Fixed order, checked for colour-blind separation.
const SLICES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

/** One survey question as the chart that fits it. Pure SVG/CSS, no libraries. */
export default function QuestionChart({ q }: { q: QuestionSummary }) {
  if (q.kind === "donut") return <Donut q={q} />;
  if (q.kind === "column") return <Columns q={q} />;
  return <Bars q={q} />;
}

function Bars({ q }: { q: QuestionSummary }) {
  return (
    <>
      {q.options.map((o) => (
        <div className="row" key={o.label} title={`${o.label}: ${o.count} of ${q.respondents} (${o.pct}%)`}>
          <div className="row-top">
            <span>{o.label}</span>
            <span>
              {o.pct}% <span style={{ color: "var(--muted)" }}>({o.count})</span>
            </span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${o.pct}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}

function Columns({ q }: { q: QuestionSummary }) {
  const max = Math.max(1, ...q.options.map((o) => o.count));
  return (
    <div className="cols" role="img" aria-label={q.label}>
      {q.options.map((o) => (
        <div className="col" key={o.label} title={`${o.label}: ${o.count} of ${q.respondents} (${o.pct}%)`}>
          <div className="col-val">
            {o.pct}% <span>({o.count})</span>
          </div>
          <div className="col-plot">
            <div className="col-bar" style={{ height: `${Math.max(3, (o.count / max) * 100)}%` }} />
          </div>
          <div className="col-lab">{o.label}</div>
        </div>
      ))}
    </div>
  );
}

function Donut({ q }: { q: QuestionSummary }) {
  const total = q.options.reduce((a, o) => a + o.count, 0) || 1;
  const GAP = 0.8; // gap between slices, in percent of the circle
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" width="132" height="132" role="img" aria-label={q.label}>
        <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="6" style={{ stroke: "var(--track)" }} />
        {q.options.map((o, i) => {
          const share = (o.count / total) * 100;
          const len = q.options.length > 1 ? Math.max(0.5, share - GAP) : share;
          const el = (
            <circle
              key={o.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              style={{ stroke: SLICES[i % SLICES.length] }}
              strokeWidth="6"
              strokeDasharray={`${len} ${100 - len}`}
              strokeDashoffset={25 - offset}
            >
              <title>{`${o.label}: ${o.count} of ${q.respondents} (${o.pct}%)`}</title>
            </circle>
          );
          offset += share;
          return el;
        })}
        <text x="21" y="21.5" textAnchor="middle" fontSize="7" fontWeight="500" style={{ fill: "var(--ink)" }}>
          {q.respondents}
        </text>
        <text x="21" y="26.5" textAnchor="middle" fontSize="3" style={{ fill: "var(--muted)" }}>
          answered
        </text>
      </svg>
      <ul className="legend">
        {q.options.map((o, i) => (
          <li key={o.label}>
            <i style={{ background: SLICES[i % SLICES.length] }} />
            <span>{o.label}</span>
            <b>
              {o.pct}% <em>({o.count})</em>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
