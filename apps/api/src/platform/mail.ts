import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { logger } from "./core";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: MailMessage): Promise<void>;
}

/**
 * Mode « non configuré » : AUCUN e-mail n'est réellement envoyé.
 * Les messages sont écrits dans .nexbridge-local/outbox/ (boîte de développement) pour
 * pouvoir suivre les liens de vérification / réinitialisation.
 */
class DevOutboxProvider implements MailProvider {
  readonly name = "boîte e-mails de développement (aucun envoi réel)";
  readonly configured = false;
  async send(message: MailMessage): Promise<void> {
    const dir = path.join(config.localDir, "outbox");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...message, date: new Date().toISOString() }, null, 2));
    logger.info({ subject: message.subject }, `E-mail écrit dans la boîte de développement : ${path.basename(file)}`);
  }
}

class SendGridProvider implements MailProvider {
  readonly name = "SendGrid";
  readonly configured = true;
  constructor(private apiKey: string) {}
  async send(message: MailMessage): Promise<void> {
    const from = config.mail.from.match(/^(.*)<(.+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: from ? { name: from[1]!.trim().replace(/^"|"$/g, ""), email: from[2]!.trim() } : { email: config.mail.from },
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          ...(message.html ? [{ type: "text/html", value: message.html }] : []),
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid a répondu ${res.status}`);
  }
}

export const mail: MailProvider = config.mail.sendgridKey ? new SendGridProvider(config.mail.sendgridKey) : new DevOutboxProvider();

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #E2E8F0">
<tr><td style="padding:24px 32px;border-bottom:1px solid #E2E8F0"><strong style="font-size:20px;color:#031646">NEX</strong><strong style="font-size:20px;color:#0B5FFF">BRIDGE</strong></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px;font-size:12px;color:#64748B;border-top:1px solid #E2E8F0">NEXBRIDGE — Connect. Innovate. Transform.</td></tr>
</table></td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0B5FFF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">${escapeHtml(label)}</a></p><p style="font-size:13px;color:#475569">Si le bouton ne fonctionne pas, copiez ce lien : <br>${escapeHtml(url)}</p>`;
}

export const emails = {
  verification(to: string, firstName: string, token: string): MailMessage {
    const url = `${config.appUrl}/verification-email?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: "Confirmez votre adresse e-mail — NEXBRIDGE",
      text: `Bonjour ${firstName},\n\nConfirmez votre adresse e-mail pour activer votre compte NEXBRIDGE :\n${url}\n\nCe lien est valable 24 heures.`,
      html: layout("Confirmez votre adresse e-mail", `<p>Bonjour ${escapeHtml(firstName)},</p><p>Confirmez votre adresse e-mail pour activer votre compte. Ce lien est valable 24 heures.</p>${button(url, "Confirmer mon e-mail")}`),
    };
  },
  accountExists(to: string, firstName: string): MailMessage {
    const url = `${config.appUrl}/connexion`;
    return {
      to,
      subject: "Vous avez déjà un compte NEXBRIDGE",
      text: `Bonjour ${firstName},\n\nUne inscription a été tentée avec cette adresse, mais un compte existe déjà. Connectez-vous ici : ${url}\nSi vous avez oublié votre mot de passe, utilisez « Mot de passe oublié ».`,
      html: layout("Vous avez déjà un compte", `<p>Bonjour ${escapeHtml(firstName)},</p><p>Une inscription a été tentée avec cette adresse, mais un compte existe déjà.</p>${button(url, "Me connecter")}`),
    };
  },
  passwordReset(to: string, firstName: string, token: string): MailMessage {
    const url = `${config.appUrl}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: "Réinitialisation de votre mot de passe — NEXBRIDGE",
      text: `Bonjour ${firstName},\n\nPour choisir un nouveau mot de passe : ${url}\n\nCe lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      html: layout("Réinitialisation du mot de passe", `<p>Bonjour ${escapeHtml(firstName)},</p><p>Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>${button(url, "Choisir un nouveau mot de passe")}`),
    };
  },
  invitation(to: string, firstName: string, companyName: string, token: string): MailMessage {
    const url = `${config.appUrl}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}&invitation=1`;
    return {
      to,
      subject: `${companyName} vous invite sur NEXBRIDGE`,
      text: `Bonjour ${firstName},\n\n${companyName} vous a ajouté(e) à son espace NEXBRIDGE. Activez votre compte : ${url}\n\nCe lien est valable 1 heure.`,
      html: layout("Vous êtes invité(e) sur NEXBRIDGE", `<p>Bonjour ${escapeHtml(firstName)},</p><p><strong>${escapeHtml(companyName)}</strong> vous a ajouté(e) à son espace NEXBRIDGE.</p>${button(url, "Activer mon compte")}`),
    };
  },
  notice(to: string, title: string, body: string, link?: string): MailMessage {
    const url = link ? `${config.appUrl}${link}` : undefined;
    return {
      to,
      subject: `${title} — NEXBRIDGE`,
      text: `${title}\n\n${body}${url ? `\n\n${url}` : ""}`,
      html: layout(title, `<p>${escapeHtml(body)}</p>${url ? button(url, "Ouvrir dans NEXBRIDGE") : ""}`),
    };
  },
  newsletterConfirm(to: string, token: string): MailMessage {
    const url = `${config.appUrl}/newsletter/confirmation?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: "Confirmez votre inscription à la newsletter NEXBRIDGE",
      text: `Confirmez votre inscription : ${url}`,
      html: layout("Confirmez votre inscription", `<p>Un dernier clic pour recevoir la newsletter NEXBRIDGE.</p>${button(url, "Confirmer mon inscription")}`),
    };
  },
};
