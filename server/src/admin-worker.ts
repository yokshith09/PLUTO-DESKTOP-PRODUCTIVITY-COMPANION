// The admin site as its own Worker ("pluto-admin"), for running without a domain:
// it serves admin/ as static files and passes /api/* to the counting server (pluto-api)
// over a service binding, so the page and its numbers share one address. Cloudflare Access
// is switched on for this Worker's workers.dev address; the counting server still checks the
// Access token itself (accessAllowed in api.ts), so the binding adds no way around the login.
export interface AdminEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
  API: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(req: Request, env: AdminEnv): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "GET") return new Response("Not allowed.", { status: 405 });
      // Only the admin route goes through; hello, ping and downloads have their own address.
      const path = url.pathname.slice(4);
      if (!path.startsWith("/v1/admin/")) return new Response("Not found.", { status: 404 });
      return env.API.fetch(new Request(new URL(path + url.search, "https://pluto-api"), req));
    }
    return env.ASSETS.fetch(req);
  },
};
