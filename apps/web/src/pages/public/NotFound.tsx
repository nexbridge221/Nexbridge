import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";

export function NotFound() {
  usePageTitle("Page introuvable");
  return (
    <section className="nb-container py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-nexus">Erreur 404</p>
      <h1 className="mt-3 text-4xl">Cette page n'existe pas.</h1>
      <p className="mx-auto mt-4 max-w-md text-muted">Le lien est peut-être incorrect ou la page a été déplacée.</p>
      <div className="mt-8"><Button asChild size="lg"><Link to="/">Retour à l'accueil</Link></Button></div>
    </section>
  );
}
