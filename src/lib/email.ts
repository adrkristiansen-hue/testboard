// Notification email content (pure, unit-tested). Transport lives in src/server/email.ts.

export type NotificationType = "ASSIGNED" | "MENTIONED" | "STATE_CHANGED" | "COMMENTED";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface NotificationEmailInput {
  to: string;
  recipientName: string;
  type: NotificationType;
  message: string;
  itemId: number;
  itemTitle: string;
  projectId: string;
  projectName: string;
  /** Base URL of the app, e.g. https://testboard.example.com (no trailing slash needed) */
  appUrl: string;
}

const SUBJECT_PREFIX: Record<NotificationType, string> = {
  ASSIGNED: "Assigned to you",
  MENTIONED: "You were mentioned",
  STATE_CHANGED: "State changed",
  COMMENTED: "New comment",
};

export function itemUrl(appUrl: string, projectId: string, itemId: number): string {
  return `${appUrl.replace(/\/+$/, "")}/p/${encodeURIComponent(projectId)}/items/${itemId}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Strip CR/LF so user-controlled titles cannot inject mail headers. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

export function buildNotificationEmail(n: NotificationEmailInput): EmailMessage {
  const url = itemUrl(n.appUrl, n.projectId, n.itemId);
  const subject = oneLine(`[${n.projectName}] ${SUBJECT_PREFIX[n.type]}: #${n.itemId} ${n.itemTitle}`).slice(0, 200);
  const text = [`Hi ${n.recipientName},`, "", n.message, "", `Open work item: ${url}`, "", "— TestBoard. Turn off emails from your user menu."].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(n.recipientName)},</p>`,
    `<p>${escapeHtml(n.message)}</p>`,
    `<p><a href="${escapeHtml(url)}">Open #${n.itemId} ${escapeHtml(n.itemTitle)}</a></p>`,
    `<p style="color:#64748b;font-size:12px">TestBoard. Turn off emails from your user menu.</p>`,
  ].join("\n");
  return { to: oneLine(n.to), subject, text, html };
}

/** Serialise as a minimal RFC 5322 message (used by the file transport). */
export function toEml(m: EmailMessage, from: string, date = new Date()): string {
  const boundary = "tb-" + date.getTime().toString(36);
  return [
    `From: ${oneLine(from)}`,
    `To: ${m.to}`,
    `Subject: ${m.subject}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    m.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    m.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
