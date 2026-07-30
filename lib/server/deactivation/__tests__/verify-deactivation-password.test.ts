import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcrypt";

import {
  verifyDeactivationPassword,
  type DeactivationPasswordActor,
  type SupabaseReauthClient,
} from "../verify-deactivation-password";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const AUTH_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_ID = "22222222-2222-4222-8222-222222222222";

async function legacyActor(
  overrides: Partial<DeactivationPasswordActor> = {}
): Promise<DeactivationPasswordActor> {
  return {
    id: "user-legacy",
    email: "owner@example.com",
    passwordHash: await bcrypt.hash("CorrectPassword1!", 10),
    supabaseAuthUserId: null,
    isActive: true,
    ...overrides,
  };
}

function supabaseActor(
  overrides: Partial<DeactivationPasswordActor> = {}
): DeactivationPasswordActor {
  return {
    id: "user-supabase",
    email: "owner@example.com",
    passwordHash: null,
    supabaseAuthUserId: AUTH_ID,
    isActive: true,
    ...overrides,
  };
}

function mockSupabaseClient(opts: {
  sessionUser?: { id: string; email: string } | null;
  signInUser?: { id: string } | null;
  signInError?: boolean;
  throwOnSignIn?: boolean;
}): () => Promise<SupabaseReauthClient> {
  return async () => ({
    auth: {
      getUser: async () => ({
        data: { user: opts.sessionUser ?? null },
        error: opts.sessionUser ? null : { message: "no session" },
      }),
      signInWithPassword: async () => {
        if (opts.throwOnSignIn) {
          throw new Error("provider down");
        }
        if (opts.signInError) {
          return { data: { user: null }, error: { message: "invalid" } };
        }
        return {
          data: { user: opts.signInUser ?? null },
          error: opts.signInUser ? null : { message: "invalid" },
        };
      },
    },
  });
}

describe("verifyDeactivationPassword — legacy mode", () => {
  const legacyEnv = { SUPABASE_AUTH_ENABLED: "false" };

  it("accepts correct password", async () => {
    const actor = await legacyActor();
    await verifyDeactivationPassword({
      actor,
      currentPassword: "CorrectPassword1!",
      env: legacyEnv,
    });
  });

  it("rejects wrong password", async () => {
    const actor = await legacyActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "WrongPassword1!",
        env: legacyEnv,
      }),
      /INVALID_PASSWORD/
    );
  });

  it("rejects missing password", async () => {
    const actor = await legacyActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "",
        env: legacyEnv,
      }),
      /MISSING_CURRENT_PASSWORD/
    );
  });

  it("rejects null local passwordHash (Supabase-managed user in legacy mode)", async () => {
    const actor = await legacyActor({ passwordHash: null });
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "CorrectPassword1!",
        env: legacyEnv,
      }),
      /AUTH_PASSWORD_REAUTH_REQUIRED/
    );
  });

  it("rejects inactive member", async () => {
    // Legacy verifier allows password proof so already_deactivated remains idempotent;
    // authorization for active-only mutations stays in deactivateEmployerAccount.
    const actor = await legacyActor({ isActive: false });
    await verifyDeactivationPassword({
      actor,
      currentPassword: "CorrectPassword1!",
      env: legacyEnv,
    });
  });
});

describe("verifyDeactivationPassword — Supabase mode", () => {
  const supabaseEnv = { SUPABASE_AUTH_ENABLED: "true" };

  it("accepts correct password for matching Auth identity", async () => {
    const actor = supabaseActor();
    await verifyDeactivationPassword({
      actor,
      currentPassword: "CorrectPassword1!",
      env: supabaseEnv,
      createSupabaseClient: mockSupabaseClient({
        sessionUser: { id: AUTH_ID, email: "owner@example.com" },
        signInUser: { id: AUTH_ID },
      }),
    });
  });

  it("rejects wrong password", async () => {
    const actor = supabaseActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "WrongPassword1!",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: { id: AUTH_ID, email: "owner@example.com" },
          signInError: true,
        }),
      }),
      /INVALID_PASSWORD/
    );
  });

  it("rejects missing password", async () => {
    const actor = supabaseActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: { id: AUTH_ID, email: "owner@example.com" },
          signInUser: { id: AUTH_ID },
        }),
      }),
      /MISSING_CURRENT_PASSWORD/
    );
  });

  it("allows null local passwordHash when Auth reauth succeeds", async () => {
    const actor = supabaseActor({ passwordHash: null });
    await verifyDeactivationPassword({
      actor,
      currentPassword: "CorrectPassword1!",
      env: supabaseEnv,
      createSupabaseClient: mockSupabaseClient({
        sessionUser: { id: AUTH_ID, email: "owner@example.com" },
        signInUser: { id: AUTH_ID },
      }),
    });
  });

  it("rejects mismatched Supabase identity", async () => {
    const actor = supabaseActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "CorrectPassword1!",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: { id: OTHER_AUTH_ID, email: "owner@example.com" },
          signInUser: { id: OTHER_AUTH_ID },
        }),
      }),
      /INVALID_PASSWORD/
    );
  });

  it("rejects inactive member for Supabase session path via missing Auth session semantics", async () => {
    // Password verifier itself does not gate isActive (idempotent already_deactivated
    // still needs password proof). Inactive actors without a live Auth session fail closed.
    const actor = supabaseActor({ isActive: false });
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "CorrectPassword1!",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: null,
        }),
      }),
      /UNAUTHORIZED/
    );
  });

  it("rejects missing supabaseAuthUserId", async () => {
    const actor = supabaseActor({ supabaseAuthUserId: null });
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "CorrectPassword1!",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: { id: AUTH_ID, email: "owner@example.com" },
          signInUser: { id: AUTH_ID },
        }),
      }),
      /AUTH_PASSWORD_REAUTH_REQUIRED/
    );
  });

  it("maps Supabase provider failure to AUTH_PROVIDER_UNAVAILABLE", async () => {
    const actor = supabaseActor();
    await assert.rejects(
      verifyDeactivationPassword({
        actor,
        currentPassword: "CorrectPassword1!",
        env: supabaseEnv,
        createSupabaseClient: mockSupabaseClient({
          sessionUser: { id: AUTH_ID, email: "owner@example.com" },
          throwOnSignIn: true,
        }),
      }),
      /AUTH_PROVIDER_UNAVAILABLE/
    );
  });
});
