import fs from "node:fs";
import assert from "node:assert/strict";
import {
  renderRedirects,
  validateRedirects,
  legacyRedirects,
} from "../src/utils/legacy-redirects.mjs";

if (process.argv.includes("--write")) {
  fs.writeFileSync("public/_redirects", renderRedirects());
} else {
  for (const file of ["public/_redirects", "dist/_redirects"]) {
    const actual = validateRedirects(fs.readFileSync(file, "utf8"));
    assert.deepEqual(
      actual,
      legacyRedirects,
      `${file} must contain exactly the canonical legacy redirects`,
    );
  }
  console.log(
    `Redirects verified: ${legacyRedirects.size} unique normalized sources; no duplicate or missing rules in the deployed artifact.`,
  );
}
