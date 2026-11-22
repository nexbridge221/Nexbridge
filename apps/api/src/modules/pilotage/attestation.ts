import PDFDocument from "pdfkit";
import { config } from "../../config";

export interface AttestationData {
  studentName: string; projectName: string; company: string; sector: string | null; startDate: Date | null; endDate: Date; role: string; skills: string[]; code: string; institution: string | null;
}

/** Attestation de participation (PDF). Aucune signature électronique n'est revendiquée (prévue en v2) : l'authenticité se vérifie en ligne avec le code. */
export function buildAttestationPdf(d: AttestationData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Attestation NEXBRIDGE — ${d.studentName}`, Author: "NEXBRIDGE", Subject: d.projectName } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const fr = (x: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(x);
    doc.rect(0, 0, doc.page.width, 110).fill("#031646");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(26).text("NEX", 56, 38, { continued: true }).fillColor("#3B82F6").text("BRIDGE");
    doc.fillColor("#CBD5E1").font("Helvetica").fontSize(10).text("Connect. Innovate. Transform.", 56, 72);
    doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(22).text("Attestation de participation", 56, 150, { align: "center" });
    doc.moveDown(1.5).font("Helvetica").fontSize(12).fillColor("#334155").text("NEXBRIDGE atteste que", { align: "center" });
    doc.moveDown(0.6).font("Helvetica-Bold").fontSize(20).fillColor("#0B5FFF").text(d.studentName, { align: "center" });
    if (d.institution) doc.moveDown(0.2).font("Helvetica").fontSize(11).fillColor("#475569").text(d.institution, { align: "center" });
    doc.moveDown(1).font("Helvetica").fontSize(12).fillColor("#334155").text(`a participé en tant que ${d.role} au projet`, { align: "center" });
    doc.moveDown(0.5).font("Helvetica-Bold").fontSize(15).fillColor("#0F172A").text(`« ${d.projectName} »`, { align: "center" });
    doc.moveDown(0.5).font("Helvetica").fontSize(12).fillColor("#334155").text(`proposé par ${d.company}${d.sector ? ` (${d.sector})` : ""}, du ${d.startDate ? fr(d.startDate) : "—"} au ${fr(d.endDate)}.`, { align: "center" });
    if (d.skills.length) { doc.moveDown(1.2).font("Helvetica-Bold").fontSize(12).fillColor("#0F172A").text("Compétences démontrées et validées", { align: "center" }); doc.moveDown(0.3).font("Helvetica").fontSize(11).fillColor("#334155").text(d.skills.join("  ·  "), { align: "center" }); }
    const y = doc.page.height - 190;
    doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor("#E2E8F0").stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`Délivrée le ${fr(new Date())}. Code de vérification : ${d.code}`, 56, y + 14, { align: "center" });
    doc.text(`Authenticité vérifiable sur ${config.appUrl}/verifier/${d.code}`, { align: "center" });
    doc.moveDown(0.6).fontSize(8).fillColor("#64748B").text("Document généré par la plateforme NEXBRIDGE. Il atteste de la participation et des compétences évaluées ; l'attribution de crédits académiques relève de l'établissement.", { align: "center" });
    doc.end();
  });
}
