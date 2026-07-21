import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import {
  assertEmployerOwner,
  createDeactivationVerificationToken,
  deliverDeactivationVerificationCode,
  VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
} from "@/lib/server/deactivation/email-verification";

export async function POST(_req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();

    if (sessionUser.accountRole !== "employer") {
      throw new Error("FORBIDDEN");
    }

    await assertEmployerOwner(sessionUser.id);
    const { code } = await createDeactivationVerificationToken(sessionUser.id);

    await deliverDeactivationVerificationCode(
      sessionUser.id,
      VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
      code
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "FORBIDDEN" || msg === "NOT_OWNER") return 403;
      if (msg === "TOO_MANY_REQUESTS") return 429;
      if (msg === "EMAIL_DELIVERY_FAILED") return 503;
      return null;
    });
  }
}
