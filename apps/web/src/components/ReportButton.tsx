import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";

export type ReportTarget = "CHALLENGE" | "PROJECT" | "USER" | "MESSAGE" | "EVALUATION";

/** Signalement d'un contenu à la modération (POST /api/reports). Le motif est obligatoire (10 caractères minimum). */
export function ReportButton({ targetType, targetId, label = "Signaler" }: { targetType: ReportTarget; targetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const send = useMutation({
    mutationFn: () => api("/reports", { method: "POST", body: { targetType, targetId, reason: reason.trim() } }),
    onSuccess: () => { toast.success("Signalement transmis à l'équipe de modération."); setOpen(false); setReason(""); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Envoi impossible pour le moment."),
  });
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><Flag className="h-4 w-4" aria-hidden /> {label}</Button>
      <Modal open={open} onOpenChange={setOpen} title="Signaler un contenu" description="Décrivez le problème : l'équipe de modération l'examinera. Votre identité n'est pas communiquée à l'auteur.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          <Field label="Motif du signalement" help="10 caractères minimum, 1000 maximum.">{(p) => <Textarea {...p} autoFocus rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={send.isPending} disabled={reason.trim().length < 10}>Envoyer</Button></div>
        </form>
      </Modal>
    </>
  );
}
