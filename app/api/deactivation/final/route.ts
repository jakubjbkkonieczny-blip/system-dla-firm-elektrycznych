import { NextRequest, NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { clearSessionCookie } from "@/lib/server/auth/session";
import { deactivateEmployerAccount } from "@/lib/server/deactivation/deactivation-service";
import {
  createDeactivatedAccessToken,
  setDeactivatedAccessCookie,
} from "@/lib/server/deactivation/deactivated-account-access";
import {
  cancelSubscriptionForAccountDeactivation,
  recordDeactivationStripeAudit,
  type DeactivationStripeCancellationStatus,
} from "@/lib/server/deactivation/deactivation-stripe-cancellation";
import { sendAccountDeactivatedConfirmationEmail } from "@/lib/server/deactivation/account-deactivated-email";
import { syncWorkerOrphanState } from "@/lib/server/workers/worker-lifecycle";

type Body = {
  currentPassword?: unknown;
  companyId?: unknown;
};

function stripeAuditAction(
  status: DeactivationStripeCancellationStatus
):
  | "deactivation_stripe_cancellation_success"
  | "deactivation_stripe_cancellation_already_inactive"
  | "deactivation_stripe_cancellation_failed"
  | "deactivation_stripe_cancellation_no_subscription" {
  if (status === "canceled") return "deactivation_stripe_cancellation_success";
  if (status === "already_canceled") return "deactivation_stripe_cancellation_already_inactive";
  if (status === "no_subscription") return "deactivation_stripe_cancellation_no_subscription";
  return "deactivation_stripe_cancellation_failed";
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await req.json().catch(() => ({}))) as Body;
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const companyId = typeof body.companyId === "string" ? body.companyId : undefined;

    if (!currentPassword) {
      return NextResponse.json({ error: "MISSING_CURRENT_PASSWORD" }, { status: 400 });
    }

    const outcome = await deactivateEmployerAccount({
      actorUserId: sessionUser.id,
      currentPassword,
      companyId,
      syncWorkerOrphanStateFn: syncWorkerOrphanState,
    });

    await recordDeactivationStripeAudit(outcome.companyId, outcome.userId, "deactivation_stripe_cancellation_attempted", {
      deactivationStatus: outcome.status,
    });

    const stripe = await cancelSubscriptionForAccountDeactivation({
      userId: outcome.userId,
      companyId: outcome.companyId,
    });

    await recordDeactivationStripeAudit(
      outcome.companyId,
      outcome.userId,
      stripeAuditAction(stripe.status),
      {
        deactivationStatus: outcome.status,
        stripeStatus: stripe.status,
        ...(stripe.errorCategory ? { errorCategory: stripe.errorCategory } : {}),
      }
    );

    const ok = stripe.status !== "cancellation_failed";
    const emailWarning =
      outcome.status === "deactivated"
        ? await sendAccountDeactivatedConfirmationEmail({
            userId: outcome.userId,
            companyId: outcome.companyId,
            deactivatedAt: outcome.deactivatedAt,
            scheduledDeletionAt: outcome.scheduledDeletionAt,
            stripeStatus: stripe.status,
          })
        : null;

    const res = NextResponse.json(
      {
        ok,
        outcome: {
          ...outcome,
          stripe: stripe.status,
        },
        ...(ok ? {} : { warning: "STRIPE_CANCELLATION_FAILED" }),
        ...(emailWarning && !emailWarning.sent ? { emailWarning: "ACCOUNT_DEACTIVATED_EMAIL_FAILED" } : {}),
      },
      { status: 200 }
    );
    clearSessionCookie(res);
    setDeactivatedAccessCookie(res, createDeactivatedAccessToken(outcome.userId));
    return res;
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "INVALID_PASSWORD") return 401;
      if (msg === "EMAIL_VERIFICATION_REQUIRED") return 403;
      if (msg === "FORBIDDEN" || msg === "NOT_OWNER") return 403;
      if (msg === "MULTIPLE_OWNED_COMPANIES") return 409;
      return null;
    });
  }
}
