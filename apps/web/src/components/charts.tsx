import { SKILL_CATEGORY_LABELS } from "@nexbridge/shared";

/** Graphiques SVG sans dépendance (légers pour les connexions limitées) ; chaque graphique fournit un équivalent textuel accessible. */

export function Radar({ data, max = 4, size = 260 }: { data: { category: string; value: number }[]; max?: number; size?: number }) {
  const c = size / 2, r = size / 2 - 38, n = data.length;
  const pt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [c + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)] as const; };
  const poly = data.map((d, i) => pt(i, d.value).join(",")).join(" ");
  const label = data.map((d) => `${SKILL_CATEGORY_LABELS[d.category as keyof typeof SKILL_CATEGORY_LABELS] ?? d.category} : ${d.value}/${max}`).join(", ");
  return (
    <figure className="mx-auto w-full" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Radar des compétences — ${label}`} className="w-full">
        {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={data.map((_, i) => pt(i, max * k).join(",")).join(" ")} fill="none" stroke="#E2E8F0" />)}
        {data.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, max)[0]} y2={pt(i, max)[1]} stroke="#E2E8F0" />)}
        <polygon points={poly} fill="#0B5FFF" fillOpacity={0.25} stroke="#0B5FFF" strokeWidth={2} />
        {data.map((d, i) => { const [x, y] = pt(i, d.value); const [lx, ly] = pt(i, max * 1.2); return (<g key={d.category}><circle cx={x} cy={y} r={3.5} fill="#0B5FFF" /><text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={600} fill="#0F172A">{SKILL_CATEGORY_LABELS[d.category as keyof typeof SKILL_CATEGORY_LABELS] ?? d.category}</text></g>); })}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

export function BarList({ items, total, tone = "#0B5FFF" }: { items: { label: string; value: number; color?: string }[]; total?: number; tone?: string }) {
  const max = total ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">{items.map((i) => (
      <li key={i.label}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-night">{i.label}</span><span className="font-bold tabular-nums text-night">{i.value}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200" aria-hidden><div className="h-full rounded-full" style={{ width: `${Math.max(i.value ? 4 : 0, (i.value / max) * 100)}%`, background: i.color ?? tone }} /></div></li>))}</ul>
  );
}

export function Donut({ items, size = 150 }: { items: { label: string; value: number; color: string }[]; size?: number }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = size / 2 - 14, c = size / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <figure className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Répartition : ${items.map((i) => `${i.label} ${i.value}`).join(", ") || "aucune donnée"}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#E2E8F0" strokeWidth={18} />
        {total > 0 && items.map((i) => { const len = (i.value / total) * C; const el = <circle key={i.label} cx={c} cy={c} r={r} fill="none" stroke={i.color} strokeWidth={18} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform={`rotate(-90 ${c} ${c})`} />; acc += len; return el; })}
        <text x={c} y={c} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#031646">{total}</text>
      </svg>
      <figcaption><ul className="space-y-1.5 text-sm">{items.map((i) => <li key={i.label} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: i.color }} aria-hidden /><span className="text-muted">{i.label}</span><strong className="tabular-nums text-night">{i.value}</strong></li>)}</ul></figcaption>
    </figure>
  );
}

export function LineChart({ points, max = 5, height = 120 }: { points: { label: string; value: number }[]; max?: number; height?: number }) {
  if (points.length === 0) return <p className="text-sm text-muted">Pas encore d'évaluation : la courbe apparaîtra après votre premier projet terminé.</p>;
  const w = 320, pad = 24;
  const x = (i: number) => (points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1));
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={`Évolution : ${points.map((p) => `${p.label} ${p.value}/5`).join(", ")}`}>
      {[1, 3, 5].map((v) => <g key={v}><line x1={pad} x2={w - pad} y1={y(v)} y2={y(v)} stroke="#E2E8F0" /><text x={4} y={y(v)} fontSize={9} dominantBaseline="middle" fill="#64748B">{v}</text></g>)}
      <polyline fill="none" stroke="#8B5CF6" strokeWidth={2.5} points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
      {points.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.value)} r={4} fill="#8B5CF6" /><text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0F172A">{p.value}</text></g>)}
    </svg>
  );
}

export function Stars({ value, onChange, label }: { value: number; onChange?: (v: number) => void; label: string }) {
  return (
    <div role={onChange ? "radiogroup" : "img"} aria-label={`${label} : ${value || "non noté"} sur 5`} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => onChange
        ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sur 5`} onClick={() => onChange(n)} className={`text-2xl leading-none ${n <= value ? "text-amber-500" : "text-slate-300 hover:text-amber-300"}`}>★</button>
        : <span key={n} aria-hidden className={`text-lg leading-none ${n <= value ? "text-amber-500" : "text-slate-300"}`}>★</span>)}
    </div>
  );
}
