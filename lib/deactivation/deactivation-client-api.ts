import {
  buildDeactivationFinalRequestBody,
  type DeactivationFinalResponse,
} from "@/lib/deactivation/deactivation-ui-helpers";
import {
  buildRecoveryRequestBody,
  type RecoveryResponse,
} from "@/lib/deactivation/recovery-ui-helpers";

async function postJson(path: string, body?: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : `HTTP_${res.status}`;
    throw new Error(err);
  }

  return json;
}

export async function startDeactivationVerification(): Promise<void> {
  await postJson("/api/deactivation/verification/start");
}

export async function confirmDeactivationVerification(code: string): Promise<void> {
  await postJson("/api/deactivation/verification/confirm", { code: code.trim() });
}

export async function submitDeactivationFinal(
  currentPassword: string
): Promise<DeactivationFinalResponse> {
  const body = buildDeactivationFinalRequestBody(currentPassword);
  return (await postJson("/api/deactivation/final", body)) as DeactivationFinalResponse;
}

export async function submitAccountRecovery(): Promise<RecoveryResponse> {
  const body = buildRecoveryRequestBody();
  try {
    return (await postJson("/api/deactivation/recover", body)) as RecoveryResponse;
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      throw new Error("NETWORK_ERROR");
    }
    throw e;
  }
}
