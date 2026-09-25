import routes from "../../notebook/legacy-routes.json" with { type: "json" };

// Workers' redirect parser compares URL-normalized pathnames (no query/hash).
// Keep case: /Protas is a legacy alias, while /protas/ is a current page.
export const normalizeCloudflareSource = (source) =>
  new URL(`//${source.startsWith("/") ? source : "/" + source}`, "relative://")
    .pathname;

// The notebook deliberately treats trailing-slash variants as the same legacy
// URL. Emit one asset rule; the SSR fallback handles both forms without wildcards.
export const normalizeLegacySource = (source) =>
  normalizeCloudflareSource(source).replace(/\/+$/, "") || "/";

export function compileRedirects(entries) {
  const result = new Map();
  for (const [source, destination] of entries) {
    if (
      !source.startsWith("/") ||
      source.startsWith("//") ||
      /[\s*?:#]/.test(source)
    )
      throw new Error(
        `Legacy redirect must use an exact local source: ${source}`,
      );
    if (
      !destination.startsWith("/") ||
      destination.startsWith("//") ||
      /\s/.test(destination)
    )
      throw new Error(
        `Legacy redirect must use a local destination: ${source}`,
      );
    const key = normalizeLegacySource(source);
    if (key === normalizeLegacySource(destination))
      throw new Error(`Legacy redirect loops back to itself: ${source}`);
    if (result.has(key) && result.get(key) !== destination)
      throw new Error(`Conflicting legacy redirect destinations for ${key}`);
    result.set(key, destination);
  }
  return new Map([...result].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export const legacyRedirects = compileRedirects(Object.entries(routes));

export function legacyDestination(url) {
  const destination = legacyRedirects.get(normalizeLegacySource(url.pathname));
  if (!destination) return undefined;
  const target = new URL(destination, url);
  if (!target.search) target.search = url.search;
  return target.pathname + target.search + target.hash;
}

export function renderRedirects(redirects = legacyRedirects) {
  return (
    "# Generated from notebook/legacy-routes.json. Do not edit by hand.\n" +
    [...redirects]
      .map(([source, destination]) => `${source} ${destination} 301`)
      .join("\n") +
    "\n"
  );
}

export function validateRedirects(text) {
  const cloudflare = new Set(),
    canonical = new Map();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const tokens = line.replace(/\s+#.*$/, "").split(/\s+/);
    if (line.length > 1000 || tokens.length < 2 || tokens.length > 3)
      throw new Error(`Invalid redirect syntax on line ${index + 1}`);
    const [source, destination, status = "302"] = tokens;
    const cfKey = normalizeCloudflareSource(source),
      key = normalizeLegacySource(source);
    if (cloudflare.has(cfKey) || canonical.has(key))
      throw new Error(
        `Duplicate normalized redirect source ${key} on line ${index + 1}`,
      );
    if (status !== "301")
      throw new Error(`Legacy redirect must be permanent on line ${index + 1}`);
    compileRedirects([[source, destination]]);
    cloudflare.add(cfKey);
    canonical.set(key, destination);
  }
  if (canonical.size > 2000)
    throw new Error("Cloudflare static redirect limit exceeded");
  return canonical;
}
