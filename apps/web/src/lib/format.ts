const nf = new Intl.NumberFormat("fr-FR");
export const formatNumber = (n: number) => nf.format(n);
export function formatBudget(b: { amount: string; currency: string } | null): string | null {
  if (!b) return null;
  const n = Number(b.amount);
  if (b.currency === "EUR") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n / 100);
  return `${nf.format(n)} FCFA`;
}
export const formatDate = (d: string | Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(d));
export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
