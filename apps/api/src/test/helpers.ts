import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../platform/core";
import { mail, type MailMessage } from "../platform/mail";

export const app = createApp();
export const sent: MailMessage[] = [];

export function captureMail() {
  sent.length = 0;
  jest.spyOn(mail, "send").mockImplementation(async (m: MailMessage) => {
    sent.push(m);
  });
}

export function tokenFromMail(to: string): string {
  const msg = [...sent].reverse().find((m) => m.to === to);
  if (!msg) throw new Error(`Aucun e-mail pour ${to}`);
  const match = msg.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Aucun jeton dans l'e-mail");
  return match[1]!;
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "User","Company","Institution","ContactMessage","NewsletterSubscriber","AuditLog","FileObject","Challenge","SystemSetting","BadgeDefinition","Report","Testimonial" RESTART IDENTITY CASCADE`,
  );
}

export const PASSWORD = "Motdepasse2026";

export async function registerAndVerify(opts: { email: string; role?: string; extra?: Record<string, unknown> }) {
  const body = {
    role: opts.role ?? "ETUDIANT",
    email: opts.email,
    password: PASSWORD,
    firstName: "Test",
    lastName: "Utilisateur",
    acceptTerms: true,
    ...(opts.role === "ENTREPRISE" ? { organizationName: "Société Test SARL" } : {}),
    ...(opts.role === "REFERENT_ACADEMIQUE" ? { institutionName: "Université Test" } : {}),
    ...opts.extra,
  };
  const res = await request(app).post("/api/auth/register").send(body);
  if (res.status !== 202) throw new Error(`register a échoué : ${res.status} ${JSON.stringify(res.body)}`);
  await request(app).post("/api/auth/verify-email").send({ token: tokenFromMail(opts.email) }).expect(200);
}

export async function loginAgent(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login a échoué : ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, token: res.body.accessToken as string, user: res.body.user };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
