export async function deliverDeactivationVerificationCode(
  userId: string,
  purpose: string,
  code: string
): Promise<void> {
  // Integration point for future email provider.
  // Do not implement provider logic here in ETAP 2A.
  // The code is available in memory only for the current request.
  return;
}
