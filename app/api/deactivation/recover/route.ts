import { NextResponse } from "next/server";

import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import {
  clearDeactivatedAccessCookie,
  getVerifiedDeactivatedAccess,
} from "@/lib/server/deactivation/deactivated-account-access";
import { getDeactivatedAccountStateFromAccess } from "@/lib/server/deactivation/get-deactivated-account-state";
import { recoverEmployerAccount } from "@/lib/server/deactivation/recovery-service";
import { sendAccountRecoveredConfirmationEmail } from "@/lib/server/deactivation/account-recovered-email";

export async function POST() {
  try {
    const claims = await getVerifiedDeactivatedAccess();
    if (!claims) {
      return NextResponse.json({ error: "MISSING_DEACTIVATED_ACCESS" }, { status: 401 });
    }

    // Re-validate binding against live deactivated state (wrong user/company/expired/replay).
    const state = await getDeactivatedAccountStateFromAccess();
    if (!state) {
      const res = NextResponse.json({ error: "MISSING_DEACTIVATED_ACCESS" }, { status: 401 });
      return clearDeactivatedAccessCookie(res);
    }
    if (state.companyId !== claims.companyId || state.userId !== claims.userId) {
      const res = NextResponse.json({ error: "MISSING_DEACTIVATED_ACCESS" }, { status: 401 });
      return clearDeactivatedAccessCookie(res);
    }
    if (!state.isRecoverable) {
      return NextResponse.json({ error: "RECOVERY_WINDOW_EXPIRED" }, { status: 403 });
    }

    const outcome = await recoverEmployerAccount(claims.userId);

    // Defense in depth: recovered company must match the capability bound at mint.
    if (outcome.companyId !== claims.companyId) {
      const res = NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      return clearDeactivatedAccessCookie(res);
    }

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
