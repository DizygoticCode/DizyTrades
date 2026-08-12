import "server-only";

import { once } from "node:events";
import { createInterface } from "node:readline";
import { connect, type TLSSocket } from "node:tls";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_TOKEN = /^[A-Za-z0-9_-]{43}$/;

type MailConfig = Readonly<{ host: string; port: number; user: string; password: string; from: string; baseUrl: string }>;
type MailMessage = Readonly<{ to: string; subject: string; text: string; html: string }>;

function cleanHeader(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) throw new Error(`Invalid ${label}.`);
  return trimmed;
}

function readConfig(): MailConfig {
  const host = cleanHeader(process.env.SMTP_HOST || "", "SMTP host");
  const user = cleanHeader(process.env.SMTP_USER || "", "SMTP user").toLowerCase();
  const password = process.env.SMTP_APP_PASSWORD || "";
  const from = cleanHeader(process.env.MAIL_FROM || "", "mail sender");
  const port = Number(process.env.SMTP_PORT || "465");
  if (!EMAIL.test(user) || !password || /[\r\n\u0000]/.test(password)) throw new Error("Account email is not configured.");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP port.");
  let base: URL;
  try { base = new URL(process.env.APP_BASE_URL?.trim() || ""); } catch { throw new Error("APP_BASE_URL is not configured."); }
  if (base.username || base.password || base.search || base.hash) throw new Error("Invalid APP_BASE_URL.");
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("APP_BASE_URL must use HTTPS in production.");
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("Invalid APP_BASE_URL protocol.");
  return { host, port, user, password, from, baseUrl: base.origin };
}

export function accountMailConfigured() {
  try { readConfig(); return true; } catch { return false; }
}

function recipientAddress(value: string) {
  const address = cleanHeader(value, "recipient").toLowerCase();
  if (address.length > 254 || !EMAIL.test(address)) throw new Error("Invalid recipient.");
  return address;
}

async function readReply(iterator: AsyncIterator<string>) {
  let code: number | null = null;
  for (;;) {
    const next = await iterator.next();
    if (next.done) throw new Error("SMTP connection closed unexpectedly.");
    const match = /^(\d{3})([ -])/.exec(String(next.value));
    if (!match) throw new Error("Malformed SMTP response.");
    const current = Number(match[1]);
    if (code === null) code = current;
    if (current !== code) throw new Error("Inconsistent SMTP response.");
    if (match[2] === " ") return code;
  }
}

async function expectReply(iterator: AsyncIterator<string>, expected: readonly number[]) {
  const code = await readReply(iterator);
  if (!expected.includes(code)) throw new Error(`SMTP rejected account mail (${code}).`);
}

async function command(socket: TLSSocket, iterator: AsyncIterator<string>, value: string, expected: readonly number[]) {
  if (/[\r\n]/.test(value)) throw new Error("Invalid SMTP command.");
  socket.write(`${value}\r\n`);
  await expectReply(iterator, expected);
}

function dotStuff(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
}

function source(config: MailConfig, message: MailMessage) {
  const boundary = `dizytrades-${Date.now().toString(36)}`;
  const to = recipientAddress(message.to);
  const subject = cleanHeader(message.subject, "mail subject");
  return [
    `From: ${cleanHeader(config.from, "mail sender")}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendAccountMail(message: MailMessage) {
  const config = readConfig();
  const recipient = recipientAddress(message.to);
  const socket = connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true, minVersion: "TLSv1.2" });
  socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP connection timed out.")));
  await once(socket, "secureConnect");
  const reader = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = reader[Symbol.asyncIterator]();
  try {
    await expectReply(iterator, [220]);
    await command(socket, iterator, "EHLO dizytrades.onrender.com", [250]);
    const auth = Buffer.from(`\u0000${config.user}\u0000${config.password}`, "utf8").toString("base64");
    await command(socket, iterator, `AUTH PLAIN ${auth}`, [235]);
    await command(socket, iterator, `MAIL FROM:<${config.user}>`, [250]);
    await command(socket, iterator, `RCPT TO:<${recipient}>`, [250, 251]);
    await command(socket, iterator, "DATA", [354]);
    socket.write(`${dotStuff(source(config, message))}\r\n.\r\n`);
    await expectReply(iterator, [250]);
    await command(socket, iterator, "QUIT", [221]);
  } finally {
    reader.close();
    socket.end();
    socket.destroy();
  }
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function tokenUrl(pathname: string, token: string) {
  if (!ACCOUNT_TOKEN.test(token)) throw new Error("Invalid account token.");
  const config = readConfig();
  const url = new URL(pathname, config.baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

function shell(title: string, message: string, action: string, href: string, note: string) {
  const [safeTitle, safeMessage, safeAction, safeHref, safeNote] = [title, message, action, href, note].map(htmlEscape);
  return `<!doctype html><html><body style="margin:0;background:#071019;color:#e9f4ff;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #23364a;border-radius:18px;padding:28px;background:#0c1722"><div style="font-size:13px;letter-spacing:.16em;color:#6fd8ff">DIZYTRADES</div><h1 style="font-size:25px;margin:12px 0 14px">${safeTitle}</h1><p style="line-height:1.6;color:#c5d6e6">${safeMessage}</p><p style="margin:28px 0"><a href="${safeHref}" style="display:inline-block;background:#3ecbff;color:#03111b;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">${safeAction}</a></p><p style="font-size:13px;line-height:1.55;color:#8196aa">${safeNote}</p><p style="font-size:12px;line-height:1.5;color:#65788b;word-break:break-all">${safeHref}</p></div></div></body></html>`;
}

export async function sendVerificationEmail(to: string, token: string) {
  const href = tokenUrl("/verify-email", token);
  const note = "This verification link expires after 24 hours. If you did not create a DizyTrades account, you can ignore this email.";
  return sendAccountMail({
    to,
    subject: "Verify your DizyTrades account",
    text: `Verify your DizyTrades account\n\nOpen this link to confirm your email address:\n${href}\n\n${note}`,
    html: shell("Verify your DizyTrades account", "Confirm that this email address belongs to your new DizyTrades account.", "Verify email", href, note),
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const href = tokenUrl("/reset-password", token);
  const note = "This password-reset link expires after 60 minutes and can be used once. If you did not request it, you can ignore this email.";
  return sendAccountMail({
    to,
    subject: "Reset your DizyTrades password",
    text: `Reset your DizyTrades password\n\nOpen this link to choose a new password:\n${href}\n\n${note}`,
    html: shell("Reset your DizyTrades password", "A password reset was requested for your DizyTrades account.", "Choose a new password", href, note),
  });
}

export async function sendMfaRecoveryEmail(to: string, token: string) {
  const href = tokenUrl("/recover-mfa", token);
  const note = "This break-glass link expires after 15 minutes and can be used once. It does not change your password.";
  return sendAccountMail({
    to,
    subject: "Recover access to DizyTrades MFA",
    text: `Recover DizyTrades MFA\n\nOpen this link to disable the current authenticator and revoke every active session:\n${href}\n\n${note}`,
    html: shell("Recover access to MFA", "This break-glass action disables the current authenticator and recovery codes, and revokes every active session.", "Recover MFA", href, note),
  });
}
