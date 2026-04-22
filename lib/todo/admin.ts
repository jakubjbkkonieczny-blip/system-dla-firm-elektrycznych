import "server-only";

function makeNoopProxy(label: string): any {
  return new Proxy(
    function () {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        if (prop === "toJSON") return () => ({});
        return makeNoopProxy(`${label}.${String(prop)}`);
      },
      apply() {
        console.log(`TODO: implement auth (${label})`);
        return Promise.resolve(null);
      },
    }
  );
}

export const auth = makeNoopProxy("auth");
export const db = makeNoopProxy("db");
export const adminAuth = auth;
export const adminDb = db;

export const FieldValue = {
  serverTimestamp: () => null,
  increment: () => 0,
  arrayUnion: (...values: unknown[]) => values,
  arrayRemove: (..._values: unknown[]) => [],
  delete: () => null,
};

export type DecodedIdToken = {
  uid: string;
  email?: string;
  [key: string]: unknown;
};
