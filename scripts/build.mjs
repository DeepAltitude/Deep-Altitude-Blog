import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// The output directory is generated only. Remove stale translated/private pages.
rmSync("dist", { recursive: true, force: true });
run(["scripts/redirects.mjs", "--write"]);
run(["node_modules/astro/astro.js", "build", "--force"]);
// Validate the final adapter output, not only the source file. Cloudflare runs
// this build command before `wrangler deploy`, so duplicate rules fail locally.
run(["scripts/redirects.mjs"]);
