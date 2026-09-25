import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "deepaltitude-requests-"),
);
const outfile = path.join(directory, "request.cjs");
await build({
  entryPoints: ["src/scripts/request.ts"],
  outfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  logLevel: "silent",
});
const { requestJSON } = createRequire(import.meta.url)(outfile);
const originalFetch = globalThis.fetch;
try {
  let attempts = 0;
  let signal;
  globalThis.fetch = async (_url, options) => {
    attempts++;
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(
    () => requestJSON("/save", { method: "POST" }, 10),
    /timed out.*save may have reached/,
  );
  assert.equal(attempts, 1, "Writes must not retry automatically");
  assert.equal(signal.aborted, true);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: () => new Promise(() => {}),
  });
  await assert.rejects(
    () => requestJSON("/publication.json", {}, 10),
    /timed out/,
  );
  globalThis.fetch = async () => {
    throw new TypeError("Connection dropped after send");
  };
  await assert.rejects(
    () => requestJSON("/save", { method: "POST" }),
    /connection was interrupted.*changes are still here.*before retrying/,
  );
  for (const status of [401, 403, 409, 503]) {
    globalThis.fetch = async () =>
      Response.json({ error: "Expected failure" }, { status });
    await assert.rejects(
      () => requestJSON("/save", { method: "POST" }),
      (error) =>
        error.status === status && error.message === "Expected failure",
    );
  }
  globalThis.fetch = async () =>
    new Response("Service unavailable", { status: 503 });
  await assert.rejects(
    () => requestJSON("/save", { method: "POST" }),
    (error) =>
      error.status === 503 && error.message.includes("save may have reached"),
  );
  globalThis.fetch = async () => Response.json({ saved: true });
  assert.deepEqual(await requestJSON("/save", { method: "POST" }), {
    saved: true,
  });
  console.log(
    "Client transport failure checks passed: stalled headers/body, interrupted save, no automatic write retry, malformed response, expired session/conflict/provider statuses, and successful save.",
  );
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(directory, { recursive: true, force: true });
}
