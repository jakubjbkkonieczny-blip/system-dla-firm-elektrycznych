import { APP_BRANDING } from "@/lib/branding";

export function wrapEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_BRANDING.name}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 24px;">
            <tr>
              <td style="padding-bottom:16px;font-size:20px;font-weight:700;color:#0f172a;">
                ${APP_BRANDING.name}
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#334155;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;font-size:12px;line-height:1.5;color:#64748b;border-top:1px solid #e2e8f0;">
                ${APP_BRANDING.description}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function wrapEmailText(bodyText: string): string {
  return `${APP_BRANDING.name}\n\n${bodyText}\n\n—\n${APP_BRANDING.description}`;
}
