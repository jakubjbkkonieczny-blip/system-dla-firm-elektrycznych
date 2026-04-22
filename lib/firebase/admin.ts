const makeStub = (name: string): any =>
  new Proxy(
    () => makeStub(name),
    {
      get: (_target, prop) => {
        if (prop === "then") return undefined;
        return makeStub(`${name}.${String(prop)}`);
      },
      apply: () => {
        console.log(`TODO: ${name}`);
        return makeStub(name);
      },
    }
  );

export const auth = {
  verifyIdToken: async () => {
    console.log("TODO: verifyIdToken");
    return null;
  },
};

export const getAuth = () => auth;

// additional stubs
export const adminAuth = auth;
export const db = makeStub("db");
export const adminDb = makeStub("adminDb");
export const FieldValue = makeStub("FieldValue");

export type DecodedIdToken = {
  uid?: string;
  [key: string]: unknown;
};
