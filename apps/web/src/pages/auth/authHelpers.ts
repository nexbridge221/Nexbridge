import { ApiError } from "@/lib/api";
import i18n from "@/i18n";

/** Message d'erreur lisible (traduit si le code est connu). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `auth:errors.${e.code}`;
    return i18n.exists(key) ? i18n.t(key) : e.message;
  }
  return "Une erreur est survenue. Réessayez.";
}
export function fieldErrors(e: unknown): Record<string, string> | null {
  return e instanceof ApiError && e.fields ? e.fields : null;
}
