import { serveCatalog } from "./catalog.ts";

export interface Env {
  CATALOG: R2Bucket;
  CATALOG_VERSION: string;
}

const usage = `schema-catalog

flux-schema validate --schema-location https://schemas.fluxoperator.dev/catalog <path>
`;

export default {
  fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);

    if (pathname === "/") {
      return new Response(usage, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (pathname === "/catalog" || pathname.startsWith("/catalog/")) {
      return serveCatalog(req, env, ctx);
    }

    return new Response("not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
} satisfies ExportedHandler<Env>;
