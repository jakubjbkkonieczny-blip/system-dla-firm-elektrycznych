export function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function getEmailFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from && from.length > 0) {
    return from;
  }
  return "VectorWork <onboarding@resend.dev>";
}
