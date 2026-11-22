/** CSV (séparateur « ; », BOM UTF-8 pour Excel). Neutralise l'injection de formules (= + - @ en début de cellule). */
export function toCsv(rows: (string | number | boolean | Date | null | undefined)[][]): string {
  const cell = (v: unknown) => { let s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
