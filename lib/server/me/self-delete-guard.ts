export const WORKER_SELF_DELETE_NOT_ALLOWED = "WORKER_SELF_DELETE_NOT_ALLOWED";
export const USE_DEACTIVATION_FINAL_ENDPOINT = "USE_DEACTIVATION_FINAL_ENDPOINT";

export type ManualSelfDeleteDecision = {
  allowed: false;
  error:
    | typeof WORKER_SELF_DELETE_NOT_ALLOWED
    | typeof USE_DEACTIVATION_FINAL_ENDPOINT;
  status: 403;
};

export function resolveManualSelfDelete(
  accountRole: string | null | undefined
): ManualSelfDeleteDecision {
  if (accountRole === "employer") {
    return {
      allowed: false,
      error: USE_DEACTIVATION_FINAL_ENDPOINT,
      status: 403,
    };
  }

  return {
    allowed: false,
    error: WORKER_SELF_DELETE_NOT_ALLOWED,
    status: 403,
  };
}
