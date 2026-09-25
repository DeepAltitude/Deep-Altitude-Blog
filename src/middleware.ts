import { defineMiddleware } from "astro:middleware";
import { privateHeaders } from "./server/guard";
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next(),
    path = context.url.pathname;
  if (
    path.startsWith("/editor") ||
    path.startsWith("/dabar") ||
    path.startsWith("/api/")
  ) {
    for (const [key, value] of Object.entries(privateHeaders))
      response.headers.set(key, value);
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
  }
  return response;
});
