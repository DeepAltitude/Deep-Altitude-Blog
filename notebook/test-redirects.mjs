import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compileRedirects,
  legacyRedirects,
  legacyDestination,
  normalizeCloudflareSource,
  normalizeLegacySource,
  renderRedirects,
  validateRedirects,
} from "../src/utils/legacy-redirects.mjs";

// Reproduce duplicate adapter output, not merely duplicate JSON keys.
for (const source of [
  "/old",
  "/old/",
  "/unused/../old",
  "/old?x=1",
  "/old#fragment",
]) {
  assert.throws(
    () => validateRedirects(`/old /new/ 301\n${source} /new/ 301\n`),
    /Duplicate normalized redirect source/,
  );
}
assert.equal(normalizeCloudflareSource("/old?x=1#fragment"), "/old");
assert.equal(normalizeLegacySource("/old/"), "/old");
assert.equal(
  compileRedirects([
    ["/old", "/new/"],
    ["/old/", "/new/"],
  ]).size,
  1,
);
assert.throws(
  () =>
    compileRedirects([
      ["/old", "/one/"],
      ["/old/", "/two/"],
    ]),
  /Conflicting/,
);
assert.throws(() => compileRedirects([["/old", "/old/"]]), /loops/);
assert.notEqual(
  normalizeLegacySource("/Protas"),
  normalizeLegacySource("/protas/"),
);
assert.equal(
  legacyDestination(new URL("https://deepaltitude.com/protas/")),
  undefined,
);
const generated = renderRedirects();
assert.deepEqual(validateRedirects(generated), legacyRedirects);
assert.equal(
  fs.readFileSync("public/_redirects", "utf8"),
  generated,
  "Regenerate redirects from the canonical map",
);
for (const [source, destination] of legacyRedirects) {
  for (const suffix of ["", "/"]) {
    const url = new URL(
      source + suffix + "?ref=preserved",
      "https://deepaltitude.com",
    );
    assert.equal(
      legacyDestination(url),
      destination + "?ref=preserved",
      source + suffix,
    );
  }
}
assert.equal(
  legacyDestination(new URL("https://deepaltitude.com/blog/03-parapente/")),
  undefined,
);
assert.equal(
  legacyDestination(new URL("https://deepaltitude.com/editor/")),
  undefined,
);
assert.equal(
  legacyDestination(new URL("https://deepaltitude.com/no-such-note/")),
  undefined,
);
console.log(
  `Redirect regression checks passed: ${legacyRedirects.size} canonical rules, both slash forms, query preservation, case-sensitive current routes, duplicate and conflict rejection.`,
);
