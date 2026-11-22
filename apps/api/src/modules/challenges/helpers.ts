import type { Challenge, Currency } from "@prisma/client";
import { forbidden, notFound, prisma } from "../../platform/core";

/** Montants : XOF en francs entiers, EUR en centimes (jamais de flottants en base). */
export function toMinor(amount: number | null | undefined, currency: Currency): bigint | null {
  if (amount == null) return null;
  return BigInt(Math.round(currency === "EUR" ? amount * 100 : amount));
}
export function fromMinor(amount: bigint | null | undefined, currency: Currency): number | null {
  if (amount == null) return null;
  return currency === "EUR" ? Number(amount) / 100 : Number(amount);
}

/** Charge un défi appartenant à l'organisation de l'utilisateur (404 sinon : on ne confirme pas l'existence). */
export async function loadOwnChallenge(userId: string, challengeId: string) {
  const member = await prisma.companyMember.findFirst({ where: { userId }, select: { companyId: true } });
  if (!member) throw forbidden("Aucune organisation rattachée à ce compte");
  const challenge = await prisma.challenge.findFirst({ where: { id: challengeId, companyId: member.companyId } });
  if (!challenge) throw notFound("Défi introuvable");
  return { challenge, companyId: member.companyId };
}

export async function recordStatus(challengeId: string, from: Challenge["status"] | null, to: Challenge["status"], actorId: string | null, note?: string) {
  await prisma.challengeStatusHistory.create({ data: { challengeId, from, to, actorId, note } });
}

export async function companyUserIds(companyId: string): Promise<string[]> {
  return (await prisma.companyMember.findMany({ where: { companyId }, select: { userId: true } })).map((m) => m.userId);
}
export async function adminUserIds(): Promise<string[]> {
  return (await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIF" }, select: { id: true } })).map((u) => u.id);
}

export const challengeInclude = {
  skills: { include: { skill: { select: { id: true, name: true, category: true } } } },
  deliverables: true,
  milestones: { orderBy: { targetWeek: "asc" as const } },
  sector: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, legalName: true, kycStatus: true } },
};

export function serializeChallenge(c: Challenge & { skills?: unknown[]; deliverables?: unknown[]; milestones?: unknown[]; sector?: unknown; company?: unknown }) {
  const { budgetAmount, ...rest } = c;
  return { ...rest, budgetAmount: fromMinor(budgetAmount, c.budgetCurrency) };
}
