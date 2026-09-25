import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
// The output directory is generated only. Remove stale translated/private pages.
rmSync("dist", { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/astro/astro.js", "build", "--force"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
