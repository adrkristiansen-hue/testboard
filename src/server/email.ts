import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toEml, type EmailMessage } from "@/lib/email";

/**
 * Pluggable mail transport, selected with EMAIL_TRANSPORT:
 *  - "console" (default): log subject/recipient to the server log
 *  - "file": write one .eml per message to EMAIL_OUTBOX_DIR (default ./outbox), viewable in any mail client
 * To use real mail, add a transport here (SMTP, SendGrid, Microsoft Graph...) and select it with EMAIL_TRANSPORT.
 */
export interface MailTransport {
  send(message: EmailMessage): Promise<void>;
}

const FROM = () => process.env.EMAIL_FROM ?? "TestBoard <no-reply@testboard.local>";

const consoleTransport: MailTransport = {
  async send(m) {
    console.info(`[email] to=${m.to} subject="${m.subject}"`);
  },
};

const fileTransport: MailTransport = {
  async send(m) {
    const dir = path.resolve(process.env.EMAIL_OUTBOX_DIR ?? "outbox");
    await mkdir(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.eml`;
    await writeFile(path.join(dir, name), toEml(m, FROM()), "utf8");
  },
};

export function emailEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
}

export function getTransport(): MailTransport {
  return process.env.EMAIL_TRANSPORT === "file" ? fileTransport : consoleTransport;
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Send without ever failing the calling request. */
export async function sendMail(messages: EmailMessage[]) {
  const t = getTransport();
  for (const m of messages) {
    try {
      await t.send(m);
    } catch (e) {
      console.error("[email] send failed", e);
    }
  }
}
