import { AlertTriangle, CalendarClock, FileText, Flag, MessageSquare, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { MILESTONE_STATUS_LABELS } from "@nexbridge/shared";
import { Badge, Card, CardBody } from "@/components/ui/misc";
import { fmtDateTime, fmtDay, fmtRelative } from "@/lib/dates";
import { useSpace } from "./ProjectLayout";

export default function Overview() {
  const { overview: o } = useSpace();
  const p = o.project; const c = o.counts;
  const mentor = o.members.find((m) => m.role === "MENTOR"), lead = o.members.find((m) => m.role === "CHEF_PROJET");
  const stat = (label: string, v: number, tone = "text-night") => (<Card><CardBody><p className="text-sm font-semibold text-muted">{label}</p><p className={`mt-1 text-3xl font-extrabold ${tone}`}>{v}</p></CardBody></Card>);
  return (
    <div className="space-y-6">
      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">{stat("À faire", c.A_FAIRE)}{stat("En cours", c.EN_COURS, "text-nexus")}{stat("En révision", c.EN_REVISION, "text-impact-text")}{stat("Terminées", c.TERMINE, "text-emerald-700")}{stat("En retard", c.late, c.late ? "text-red-700" : "text-night")}</section>
      {o.alerts.length > 0 && <section aria-label="Alertes" className="space-y-2">{o.alerts.map((a) => <div key={a.text} role="status" className={`flex items-start gap-3 rounded-md border p-3 text-sm ${a.level === "critique" ? "border-red-200 bg-red-50 text-red-950" : a.level === "attention" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong className="font-semibold capitalize">{a.level}</strong> — {a.text}</span></div>)}</section>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card><CardBody>
            <h2 className="text-lg">Vue générale</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Défi</dt><dd className="font-semibold text-night">{p.challenge.title}</dd></div>
              <div><dt className="text-muted">Chef de projet</dt><dd className="font-semibold text-night">{lead?.name ?? "—"}</dd></div>
              <div><dt className="text-muted">Mentor</dt><dd className="font-semibold text-night">{mentor?.name ?? "Non affecté"}</dd></div>
              <div><dt className="text-muted">Période</dt><dd className="font-semibold text-night">{p.startDate ? fmtDay(p.startDate) : "—"} → {p.plannedEndDate ? fmtDay(p.plannedEndDate) : "—"}</dd></div>
              <div><dt className="text-muted">Budget</dt><dd className="font-semibold text-night">{o.budget?.amount != null ? `${new Intl.NumberFormat("fr-FR").format(o.budget.amount)} ${o.budget.currency === "XOF" ? "FCFA" : "EUR"}` : "—"}</dd></div>
              <div><dt className="text-muted">Prochaine échéance</dt><dd className="font-semibold text-night">{o.nextDeadline ? `${o.nextDeadline.kind} « ${o.nextDeadline.title} » le ${fmtDay(o.nextDeadline.at)}` : "—"}</dd></div>
              <div><dt className="text-muted">Dernière activité</dt><dd className="font-semibold text-night">{p.lastActivityAt ? fmtRelative(p.lastActivityAt) : "—"}</dd></div>
              <div><dt className="text-muted">Règle de validation des jalons</dt><dd className="font-semibold text-night">{p.milestoneRule === "LES_DEUX" ? "Mentor et entreprise" : p.milestoneRule === "MENTOR" ? "Mentor" : "Entreprise"}</dd></div>
            </dl>
            {p.description && <p className="mt-4 line-clamp-4 text-sm text-muted">{p.description}</p>}
            {p.escrowStatus && <p className="mt-4 text-xs text-muted">Séquestre : {p.escrowStatus === "NON_DEPOSE" ? "non déposé — le paiement en ligne sera activé en phase 5 (aucune transaction à ce stade)" : p.escrowStatus}</p>}
          </CardBody></Card>
          <Card><CardBody><h2 className="text-lg">Activité récente</h2>
            <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">{o.activity.map((e) => <li key={e.id} className="relative text-sm"><span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-nexus" aria-hidden /><p className="text-night">{e.label}</p><p className="text-xs text-muted">{fmtRelative(e.createdAt)}</p></li>)}</ol>
            <Link to="activite" className="mt-4 inline-block text-sm font-semibold text-nexus hover:underline">Voir tout le fil d'activité</Link>
          </CardBody></Card>
        </div>
        <div className="space-y-6">
          <Card><CardBody><h2 className="flex items-center gap-2 text-base"><Flag className="h-4 w-4 text-nexus" aria-hidden />Jalons à venir</h2>
            {o.milestones.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun jalon à venir.</p> : <ul className="mt-3 space-y-2.5">{o.milestones.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 text-sm"><span><span className="font-semibold text-night">{m.title}</span><span className="block text-xs text-muted">{fmtDay(m.targetDate)}</span></span><Badge tone={m.status === "MANQUE" ? "red" : "neutral"}>{MILESTONE_STATUS_LABELS[m.status as keyof typeof MILESTONE_STATUS_LABELS] ?? m.status}</Badge></li>)}</ul>}
            <Link to="jalons" className="mt-3 inline-block text-sm font-semibold text-nexus hover:underline">Tous les jalons</Link></CardBody></Card>
          <Card><CardBody><h2 className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-nexus" aria-hidden />Prochaines réunions</h2>
            {o.meetings.length === 0 ? <p className="mt-3 text-sm text-muted">Aucune réunion planifiée.</p> : <ul className="mt-3 space-y-2.5">{o.meetings.map((m) => <li key={m.id} className="text-sm"><span className="font-semibold text-night">{m.title}</span><span className="block text-xs text-muted">{fmtDateTime(m.startsAt)}</span>{m.videoUrl && <a href={m.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-nexus hover:underline"><Video className="h-3.5 w-3.5" aria-hidden />Rejoindre</a>}</li>)}</ul>}</CardBody></Card>
          <Card><CardBody><h2 className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-nexus" aria-hidden />Derniers messages</h2>
            {o.lastMessages.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun message.</p> : <ul className="mt-3 space-y-2.5">{o.lastMessages.map((m) => <li key={m.id} className="text-sm"><span className="font-semibold text-night">{m.author}</span> <span className="text-xs text-muted">#{m.channel} · {fmtRelative(m.createdAt)}</span><p className="line-clamp-2 text-muted">{m.body || "Fichier partagé"}</p></li>)}</ul>}
            <Link to="messages" className="mt-3 inline-block text-sm font-semibold text-nexus hover:underline">Ouvrir la messagerie</Link></CardBody></Card>
          <Card><CardBody><h2 className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-nexus" aria-hidden />Derniers documents</h2>
            {o.lastDocuments.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun document.</p> : <ul className="mt-3 space-y-2 text-sm">{o.lastDocuments.map((d) => <li key={d.id} className="flex justify-between gap-2"><span className="truncate font-medium text-night">{d.name}</span><span className="shrink-0 text-xs text-muted">v{d.version} · {fmtRelative(d.createdAt)}</span></li>)}</ul>}
            <Link to="documents" className="mt-3 inline-block text-sm font-semibold text-nexus hover:underline">Bibliothèque</Link></CardBody></Card>
        </div>
      </div>
    </div>
  );
}
