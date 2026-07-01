import { Resend } from "resend";
import { logger } from "./logger";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("RESEND_API_KEY not set — outbound emails are disabled");
    return null;
  }
  _resend = new Resend(key);
  return _resend;
}
const FROM = "Sweatheory Wellness <noreply@sweatheory.com>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
const BRAND = "#CD9771";
const BG = "#FBF8F5";
const CARD = "#FFFFFF";
const BORDER = "#E8DDD0";
const MUTED = "#8B7355";
export const BASE_URL = "https://sweatheory.com";

function layout(content: string, preheader = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sweatheory Wellness</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2C1E0F;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&zwnj;&nbsp;</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};padding:40px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;width:100%;">
      <tr><td style="padding:0 0 28px;text-align:center;">
        <span style="font-size:26px;font-weight:700;letter-spacing:0.14em;color:#2C1E0F;">SWEAT<span style="color:${BRAND};">HEORY</span></span>
      </td></tr>
      <tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:18px;padding:40px 36px 32px;overflow:hidden;">
        ${content}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;color:#4b5563;font-size:12px;line-height:1.7;">
        <p style="margin:0 0 4px;">Sweatheory Wellness Sweatheory &mdash; The Creator Platformmdash; Find What Works.</p>
        <p style="margin:0;">You received this because you have an account on Sweatheory Wellness</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const h = (t: string) => `<h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#2C1E0F;line-height:1.3;">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${MUTED};">${t}</p>`;
const hr = () => `<hr style="border:none;border-top:1px solid ${BORDER};margin:26px 0;">`;
const btn = (label: string, url: string) =>
  `<div style="margin-top:26px;"><a href="${url}" style="display:inline-block;background:${BRAND};color:#000;font-weight:800;font-size:14px;padding:13px 28px;border-radius:10px;text-decoration:none;">${label}</a></div>`;

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6b7280;width:38%;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:#2C1E0F;font-weight:600;">${value}</td>
  </tr>`;
}

// ─── Welcome ────────────────────────────────────────────────────────────────
export function sendWelcomeEmail(to: string, username: string) {
  const safeUsername = escapeHtml(username);
  getResend()?.emails.send({
    from: FROM, to,
    subject: `Welcome to Sweatheory, @${safeUsername}! 🎉`,
    html: layout(`
      ${h("You're officially in the city.")}
      ${p(`Hey <strong style="color:#2C1E0F;">@${safeUsername}</strong>, welcome to Sweatheory — the platform built for creators who go all in.`)}
      ${hr()}
      <ul style="margin:0 0 16px;padding:0 0 0 20px;color:${MUTED};font-size:14px;line-height:2.2;">
        <li>Post photos, videos &amp; text to your feed</li>
        <li>Go live and collect tips from your audience</li>
        <li>Sell custom merch — print-on-demand, zero inventory</li>
        <li>Explore the marketplace and exclusive auctions</li>
        <li>DM and connect with other creators</li>
      </ul>
      ${btn("Start Exploring →", BASE_URL)}
    `, `Welcome to Sweatheory, @${username}!`),
  }).catch((err: unknown) => logger.error({ err }, "sendWelcomeEmail failed"));
}

// ─── Password Reset ──────────────────────────────────────────────────────────
export function sendPasswordResetEmail(to: string, resetUrl: string) {
  getResend()?.emails.send({
    from: FROM, to,
    subject: "Reset your Sweatheory password",
    html: layout(`
      ${h("Password reset request")}
      ${p("We received a request to reset your Sweatheory password. Click the button below — this link expires in <strong style=\"color:#2C1E0F;\">1 hour</strong>.")}
      ${btn("Reset My Password", resetUrl)}
      ${hr()}
      ${p("If you didn't request this, you can safely ignore it. Your password won't change.")}
      <p style="margin:0;font-size:12px;color:#4b5563;">Can't click the button? Copy this link:<br>
        <span style="color:${BRAND};word-break:break-all;">${resetUrl}</span>
      </p>
    `, "Reset your Sweatheory password"),
  }).catch((err: unknown) => logger.error({ err }, "sendPasswordResetEmail failed"));
}

// ─── New Follower ────────────────────────────────────────────────────────────
export function sendNewFollowerEmail(
  to: string,
  followerDisplayName: string,
  followerUsername: string,
) {
  const safeName = escapeHtml(followerDisplayName);
  const safeUser = escapeHtml(followerUsername);
  getResend()?.emails.send({
    from: FROM, to,
    subject: `@${safeUser} started following you`,
    html: layout(`
      ${h("You have a new follower! 👀")}
      ${p(`<strong style="color:#2C1E0F;">${safeName}</strong> (<a href="${BASE_URL}/profile/${safeUser}" style="color:${BRAND};text-decoration:none;">@${safeUser}</a>) just started following you on Sweatheory.`)}
      ${p("Keep creating — your audience is growing.")}
      ${btn(`View @${safeUser}'s Profile`, `${BASE_URL}/profile/${safeUser}`)}
    `, `@${safeUser} is now following you`),
  }).catch((err: unknown) => logger.error({ err }, "sendNewFollowerEmail failed"));
}

// ─── Tip Received ────────────────────────────────────────────────────────────
export function sendTipReceivedEmail(
  to: string,
  senderDisplayName: string,
  senderUsername: string,
  amount: number,
  message?: string | null,
) {
  const safeName = escapeHtml(senderDisplayName);
  const safeUser = escapeHtml(senderUsername);
  const safeMsg = message ? escapeHtml(message) : null;
  getResend()?.emails.send({
    from: FROM, to,
    subject: `You received a $${amount.toFixed(2)} tip 💰`,
    html: layout(`
      ${h("You just got tipped!")}
      ${p(`<strong style="color:#2C1E0F;">${safeName}</strong> (<a href="${BASE_URL}/profile/${safeUser}" style="color:${BRAND};text-decoration:none;">@${safeUser}</a>) sent you a <strong style="color:${BRAND};">$${amount.toFixed(2)}</strong> tip.`)}
      ${safeMsg ? `<div style="background:#0d0d16;border-left:3px solid ${BRAND};padding:14px 18px;border-radius:0 10px 10px 0;margin:16px 0;font-size:14px;color:#d1d5db;font-style:italic;">"${safeMsg}"</div>` : ""}
      ${hr()}
      ${p("The amount has been credited to your Sweatheory wallet.")}
      ${btn("View Wallet", `${BASE_URL}/wallet`)}
    `, `$${amount.toFixed(2)} tip from @${safeUser}`),
  }).catch((err: unknown) => logger.error({ err }, "sendTipReceivedEmail failed"));
}

// ─── New Message ─────────────────────────────────────────────────────────────
export function sendNewMessageEmail(
  to: string,
  senderDisplayName: string,
  senderUsername: string,
  conversationId: number,
) {
  const safeName = escapeHtml(senderDisplayName);
  const safeUser = escapeHtml(senderUsername);
  getResend()?.emails.send({
    from: FROM, to,
    subject: `New message from @${safeUser}`,
    html: layout(`
      ${h("You have a new message 💬")}
      ${p(`<strong style="color:#2C1E0F;">${safeName}</strong> (<a href="${BASE_URL}/profile/${safeUser}" style="color:${BRAND};text-decoration:none;">@${safeUser}</a>) sent you a direct message on Sweatheory.`)}
      ${btn("Read &amp; Reply", `${BASE_URL}/messages/${conversationId}`)}
      ${hr()}
      ${p("You can manage your notification preferences in Settings.")}
    `, `New message from @${safeUser}`),
  }).catch((err: unknown) => logger.error({ err }, "sendNewMessageEmail failed"));
}

// ─── Merch Order Confirmation ────────────────────────────────────────────────
export function sendMerchOrderConfirmation(opts: {
  to: string;
  buyerUsername: string;
  productTitle: string;
  productType: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
  totalAmount: number;
  fulfillmentId: string;
  shippingName: string;
  shippingCity: string;
  shippingState: string;
}) {
  const emojis: Record<string, string> = {
    shirt: "👕", hoodie: "🧥", hat: "🧢", poster: "🖼️",
    sticker: "✨", mug: "☕", tote_bag: "👜", phone_case: "📱",
    vinyl_cover: "💿", sweatpants: "👖",
  };
  const emoji = emojis[opts.productType] ?? "🛍️";

  const rows = [
    row("Product", `${emoji} ${opts.productTitle}`),
    ...(opts.color ? [row("Color", opts.color)] : []),
    ...(opts.size ? [row("Size", opts.size)] : []),
    row("Quantity", String(opts.quantity)),
    row("Ships to", `${opts.shippingName}, ${opts.shippingCity} ${opts.shippingState}`),
    row("Order ID", `<span style="font-family:monospace;font-size:12px;">${opts.fulfillmentId}</span>`),
  ].join("");

  getResend()?.emails.send({
    from: FROM, to: opts.to,
    subject: `Order confirmed: "${opts.productTitle}" ${emoji}`,
    html: layout(`
      ${h(`Order Confirmed! ${emoji}`)}
      ${p(`Thanks <strong style="color:#2C1E0F;">@${escapeHtml(opts.buyerUsername)}</strong> — your merch order is confirmed and has been sent to our fulfillment partner for printing.`)}
      ${hr()}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">${rows}</table>
      <div style="background:#0d0d16;border:1px solid ${BORDER};border-radius:12px;padding:18px;text-align:center;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Total charged from wallet</div>
        <div style="font-size:32px;font-weight:900;color:${BRAND};">$${opts.totalAmount.toFixed(2)}</div>
      </div>
      ${hr()}
      ${p("Print-on-demand orders typically ship in 5–7 business days. You'll receive tracking info once your item ships.")}
      ${btn("Track Your Orders", `${BASE_URL}/merch/orders`)}
    `, `Your Sweatheory merch order is confirmed`),
  }).catch((err: unknown) => logger.error({ err }, "sendMerchOrderConfirmation failed"));
}

// ─── Bug Report ──────────────────────────────────────────────────────────────
const ISSUE_TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  content_report: "Content Report",
  account_issue: "Account Issue",
  other: "Other",
};

export function sendBugReportEmail(opts: {
  reportId: number;
  issueType: string;
  description: string;
  contactEmail: string;
  userId?: number;
}) {
  const typeLabel = ISSUE_TYPE_LABELS[opts.issueType] ?? opts.issueType;
  const safeDesc = escapeHtml(opts.description);
  const safeEmail = escapeHtml(opts.contactEmail);

  getResend()?.emails.send({
    from: FROM,
    to: "support@sweatheory.com",
    replyTo: opts.contactEmail,
    subject: `[${typeLabel}] Report #${opts.reportId} — Sweatheory Support`,
    html: layout(`
      ${h(`New ${typeLabel} — Report #${opts.reportId}`)}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
        ${row("Report ID", `<span style="font-family:monospace;">#${opts.reportId}</span>`)}
        ${row("Issue Type", typeLabel)}
        ${row("User ID", opts.userId ? String(opts.userId) : "Guest")}
        ${row("Contact Email", `<a href="mailto:${safeEmail}" style="color:${BRAND};text-decoration:none;">${safeEmail}</a>`)}
      </table>
      ${hr()}
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Description</p>
      <div style="background:#0d0d16;border:1px solid ${BORDER};border-radius:12px;padding:18px;font-size:14px;color:#d1d5db;line-height:1.7;white-space:pre-wrap;word-break:break-word;">${safeDesc}</div>
      ${hr()}
      <p style="margin:0;font-size:12px;color:#4b5563;">Reply to this email to respond directly to the user at ${safeEmail}.</p>
    `, `[${typeLabel}] New report from Sweatheory`),
  }).catch((err: unknown) => logger.error({ err }, "sendBugReportEmail failed"));
}

// ─── TAKE IT DOWN Act Notification ──────────────────────────────────────────

export function sendTakedownNotificationEmail(opts: {
  requestId: number;
  requesterName: string;
  requesterEmail: string;
  relationship: string;
  contentUrl: string;
  statement: string;
}) {
  const safeEmail = escapeHtml(opts.requesterEmail);
  const safeName = escapeHtml(opts.requesterName);
  const safeUrl = escapeHtml(opts.contentUrl);
  const safeStatement = escapeHtml(opts.statement.slice(0, 500));
  const relLabel = opts.relationship === "authorized_rep" ? "Authorized Representative" : "Depicted Individual";

  getResend()?.emails.send({
    from: FROM,
    to: "legal@sweatheory.com",
    replyTo: opts.requesterEmail,
    subject: `[TAKE IT DOWN Act] Request #${opts.requestId} — Action Required within 48 Hours`,
    html: layout(`
      ${h(`🚨 TAKE IT DOWN Act Request #${opts.requestId}`)}
      <div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#fca5a5;font-weight:700;">Federal compliance required · Remove valid content within 48 hours of receipt.</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
        ${row("Request ID", `<span style="font-family:monospace;">#${opts.requestId}</span>`)}
        ${row("Submitted by", `${safeName} &lt;<a href="mailto:${safeEmail}" style="color:${BRAND};text-decoration:none;">${safeEmail}</a>&gt;`)}
        ${row("Relationship", relLabel)}
        ${row("Content URL", `<a href="${safeUrl}" style="color:${BRAND};text-decoration:none;word-break:break-all;">${safeUrl}</a>`)}
      </table>
      ${hr()}
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Statement of Non-Consent</p>
      <div style="background:#0d0d16;border:1px solid ${BORDER};border-radius:12px;padding:18px;font-size:14px;color:#d1d5db;line-height:1.7;white-space:pre-wrap;word-break:break-word;">${safeStatement}${opts.statement.length > 500 ? "…" : ""}</div>
      ${hr()}
      ${btn("Review in Admin Panel →", `${BASE_URL}/admin`)}
      <p style="margin-top:20px;font-size:12px;color:#4b5563;">You can also reply to this email to respond to the requestor at ${safeEmail}.</p>
    `, `[TAKE IT DOWN Act] Request #${opts.requestId} — Action Required`),
  }).catch((err: unknown) => logger.error({ err }, "sendTakedownNotificationEmail failed"));
}

// ─── Custom Request Notification ─────────────────────────────────────────────
export function sendCustomRequestEmail(
  to: string,
  requesterDisplayName: string,
  requesterUsername: string,
  requestTitle: string,
  budget: number,
) {
  const safeName = escapeHtml(requesterDisplayName);
  const safeUser = escapeHtml(requesterUsername);
  const safeTitle = escapeHtml(requestTitle);
  getResend()?.emails.send({
    from: FROM, to,
    subject: `New custom request from @${safeUser}: "${safeTitle}"`,
    html: layout(`
      ${h("You have a new custom content request! ✏️")}
      ${p(`<strong style="color:#2C1E0F;">${safeName}</strong> (<a href="${BASE_URL}/profile/${safeUser}" style="color:${BRAND};text-decoration:none;">@${safeUser}</a>) has sent you a custom content request.`)}
      ${hr()}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
        ${row("Title", safeTitle)}
        ${row("Budget", `<strong style="color:${BRAND};">$${budget.toFixed(2)}</strong>`)}
      </table>
      ${btn("View Request →", `${BASE_URL}/requests`)}
      ${hr()}
      ${p("You can accept, decline, or make a counter-offer from the Requests page.")}
    `, `New custom request from @${safeUser}`),
  }).catch((err: unknown) => logger.error({ err }, "sendCustomRequestEmail failed"));
}
