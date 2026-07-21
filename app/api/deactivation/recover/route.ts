import { NextResponse } from "next/server";

import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import {
  clearDeactivatedAccessCookie,
  getDeactivatedAccessUserId,
} from "@/lib/server/deactivation/deactivated-account-access";
import { recoverEmployerAccount } from "@/lib/server/deactivation/recovery-service";
import { sendAccountRecoveredConfirmationEmail } from "@/lib/server/deactivation/account-recovered-email";

export async function POST() {
  try {
    const actorUserId = await getDeactivatedAccessUserId();
    if (!actorUserId) {
      return NextResponse.json({ error: "MISSING_DEACTIVATED_ACCESS" }, { status: 401 });
    }

    const outcome = await recoverEmployerAccount(actorUserId);

    const emailWarning =
      outcome.status === "recovered"
        ? await sendAccountRecoveredConfirmationEmail({
            userId: outcome.userId,
            companyId: outcome.companyId,
          })
        : null;

    const res = NextResponse.json(
      {
        ok: true,
        outcome,
        requiresLogin: true,
        ...(emailWarning && !emailWarning.sent ? { emailWarning: "ACCOUNT_RECOVERED_EMAIL_FAILED" } : {}),
      },
      { status: 200 }
    );

    return clearDeactivatedAccessCookie(res);
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "MISSING_DEACTIVATED_ACCESS") return 401;
      if (msg === "RECOVERY_WINDOW_EXPIRED") return 403;
      if (msg === "FORBIDDEN" || msg === "NOT_OWNER" || msg === "NOT_DEACTIVATED") return 403;
      if (msg === "MULTIPLE_OWNED_COMPANIES") return 409;
      return null;
    });
  }
}
