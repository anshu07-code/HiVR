/**
 * Email delivery for transactional messages (forgot-password OTP, etc.).
 *
 * Modes (chosen by env):
 *  - RESEND_API_KEY set                → send via Resend (use the free
 *                                        onboarding@resend.dev sender unless
 *                                        RESEND_FROM is overridden with a
 *                                        verified domain address).
 *  - RESEND_API_KEY unset              → log the email to the server console
 *                                        and return success. This is the dev
 *                                        default; the user still receives the
 *                                        OTP via the console.
 *
 * Production: set RESEND_API_KEY and RESEND_FROM (verified domain).
 */
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? "HiVR <onboarding@resend.dev>";
const client = apiKey ? new Resend(apiKey) : null;

export type OtpEmailResult = { ok: boolean; delivered: "email" | "console" | "error"; id?: string; error?: string };

export async function sendOtpEmail(to: string, code: string, ttlMin = 10): Promise<OtpEmailResult> {
  const subject = `Your HiVR password reset code: ${code}`;
  const html = renderOtpEmail(code, ttlMin);
  const text = `Your HiVR password reset code is: ${code}\n\nThis code expires in ${ttlMin} minutes. If you didn't request this, ignore this email.`;

  if (!client) {
    console.log(
      `\n[forgot-password] ───────────────────────────────────\n` +
      `  To:      ${to}\n` +
      `  Subject: ${subject}\n` +
      `  Code:    ${code}\n` +
      `  (no RESEND_API_KEY set — set it in .env.local to deliver real emails)\n` +
      `───────────────────────────────────────────────────\n`,
    );
    return { ok: true, delivered: "console" };
  }

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error(`[forgot-password] Resend error: ${error.message}`);
      return { ok: false, delivered: "error", error: error.message };
    }
    console.log(`[forgot-password] Email sent to ${to} (id=${data?.id})`);
    return { ok: true, delivered: "email", id: data?.id };
  } catch (e: any) {
    console.error(`[forgot-password] Resend exception: ${e?.message}`);
    return { ok: false, delivered: "error", error: e?.message };
  }
}

function renderOtpEmail(code: string, ttlMin: number): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:32px;">
          <tr><td>
            <h1 style="margin:0 0 8px;font-size:22px;color:#09090b;font-weight:700;">HiVR password reset</h1>
            <p style="margin:0 0 24px;color:#52525b;font-size:14px;line-height:1.5;">
              We received a request to reset the password for your HiVR account. Use the code below to continue. It expires in ${ttlMin} minutes.
            </p>
            <div style="margin:0 0 24px;padding:20px;background:#f4f4f5;border-radius:8px;text-align:center;">
              <div style="font-size:32px;font-weight:700;letter-spacing:0.5em;color:#09090b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</div>
            </div>
            <p style="margin:0 0 8px;color:#52525b;font-size:13px;line-height:1.5;">
              If you didn't request this, you can safely ignore this email — your password won't change.
            </p>
            <p style="margin:24px 0 0;color:#a1a1aa;font-size:11px;">
              HiVR — India's micro-task + role-engagement marketplace.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
