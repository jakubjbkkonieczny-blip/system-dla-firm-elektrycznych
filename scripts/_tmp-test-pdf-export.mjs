import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const userId = "cmouj03p400008dh0v4ma8cfz";
const companyId = "cmpa5dv4w0001ipjrjwkyfovv";
const jobId = "cmq7xblfv0002e6akg6cscdny";

function createSignedSessionToken(userId, sessionVersion = 0) {
  const secret = process.env.SESSION_SECRET;
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const payload = JSON.stringify({ userId, exp, sessionVersion });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  return Buffer.from(`${payloadB64}.${sig}`, "utf8").toString("base64url");
}

async function tryFetch(port) {
  const url = `http://127.0.0.1:${port}/api/companies/${companyId}/jobs/${jobId}/budget/export?format=pdf`;
  const res = await fetch(url, {
    headers: { Cookie: `session=${createSignedSessionToken(userId)}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, buf, port };
}

let result;
for (const port of [3000, 3001]) {
  try {
    result = await tryFetch(port);
    break;
  } catch {
    // try next port
  }
}

if (!result) {
  console.error("Dev server not reachable on port 3000 or 3001");
  process.exit(1);
}

const { res, buf, port } = result;
console.log("Port:", port);
console.log("HTTP status:", res.status);
console.log("Content-Type:", res.headers.get("content-type"));
console.log("Content-Length:", buf.length);
console.log("Starts with %PDF:", buf.subarray(0, 5).toString("ascii") === "%PDF-");
if (res.ok) writeFileSync("scripts/_tmp-export-sample.pdf", buf);
