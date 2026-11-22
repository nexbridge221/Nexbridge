import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Card, CardBody, EmptyState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { api, ApiError } from "@/lib/api";
import { STUDY_LEVEL_LABELS } from "@nexbridge/shared";

interface V { teamId: string; challenge: { title: string; company: string; durationWeeks: number | null }; students: { name: string; program: string | null; studyLevel: string | null }[] }

export default function AcademicValidations() {
  usePageTitle("Validations académiques");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["academic-validations"], queryFn: () => api<{ institution: { name: string; status: string } | null; validations: V[] }>("/academic/validations") });
  const [refuse, setRefuse] = useState<V | null>(null);
  const [comment, setComment] = useState("");
  const decide = useMutation({
    mutationFn: ({ teamId, decision, comment }: { teamId: string; decision: "VALIDE" | "REFUSE"; comment?: string }) => api(`/academic/validations/${teamId}/decide`, { method: "POST", body: { decision, comment } }),
    onSuccess: async (_d, v) => { toast.success(v.decision === "VALIDE" ? "Projet validé." : "Validation refusée."); setRefuse(null); setComment(""); await qc.invalidateQueries({ queryKey: ["academic-validations"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible."),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl">Validations académiques</h1>
      {isLoading && <Skeleton className="h-32" />}
      {data?.institution && data.institution.status !== "VALIDE" && <Alert tone="warning" title="Établissement en attente de validation">« {data.institution.name} » doit être validé par l'équipe NEXBRIDGE avant que vous puissiez valider des projets. Tant que ce n'est pas fait, vos étudiants ne sont pas soumis à une validation académique.</Alert>}
      {data && data.validations.length === 0 && data.institution?.status === "VALIDE" && <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="Aucun projet à valider">Quand une équipe incluant vos étudiants est acceptée par l'entreprise et par les étudiants, elle apparaît ici pour validation avant le lancement officiel.</EmptyState>}
      {data?.validations.map((v) => (
        <Card key={v.teamId}><CardBody>
          <h2 className="text-lg">{v.challenge.title}</h2><p className="text-sm text-muted">{v.challenge.company}{v.challenge.durationWeeks ? ` · ${v.challenge.durationWeeks} semaines` : ""}</p>
          <h3 className="mt-4 text-sm font-bold text-night">Vos étudiants dans l'équipe</h3>
          <ul className="mt-2 flex flex-wrap gap-2">{v.students.map((s) => <li key={s.name}><Badge tone="teal">{s.name}{s.program ? ` · ${s.program}` : ""}{s.studyLevel ? ` · ${STUDY_LEVEL_LABELS[s.studyLevel as keyof typeof STUDY_LEVEL_LABELS] ?? s.studyLevel}` : ""}</Badge></li>)}</ul>
          <div className="mt-5 flex gap-3"><Button loading={decide.isPending && decide.variables?.teamId === v.teamId && decide.variables.decision === "VALIDE"} onClick={() => decide.mutate({ teamId: v.teamId, decision: "VALIDE" })}>Valider le projet</Button><Button variant="secondary" onClick={() => setRefuse(v)}>Refuser</Button></div>
        </CardBody></Card>
      ))}
      <Modal open={Boolean(refuse)} onOpenChange={(o) => !o && setRefuse(null)} title="Refuser la validation ?" description="L'équipe sera annulée et l'entreprise informée. Le motif est obligatoire.">
        <Field label="Motif">{(p) => <Textarea {...p} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        <div className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRefuse(null)}>Retour</Button><Button variant="danger" disabled={!comment.trim()} loading={decide.isPending} onClick={() => refuse && decide.mutate({ teamId: refuse.teamId, decision: "REFUSE", comment })}>Refuser</Button></div>
      </Modal>
    </div>
  );
}
