import { accounts, viewer, cleanAccounts } from "./auth.js";
import { check, json, Problem } from "./common.js";
import {
  changeMod,
  createMod,
  details,
  discover,
  feed,
  removeAsset,
  studioDetail,
  studioList,
} from "./catalog.js";
import {
  clean,
  finishUpload,
  putPart,
  serveFile,
  startUpload,
} from "./files.js";

async function route(req, env, ctx) {
  const url = new URL(req.url),
    p = url.pathname,
    m = req.method,
    read = m === "GET" || m === "HEAD";
  if (!read)
    check(
      req.headers.get("Origin") === url.origin,
      403,
      "This action must come from the Moader site.",
    );
  if (p === "/catalog.json" && read) return feed(url, env);
  if (p === "/api/discover" && m === "GET") return discover(url, env);
  const pieces = p.split("/").filter(Boolean).map(decodeURIComponent);
  if (pieces[0] === "files" && pieces.length === 3 && read)
    return serveFile(req, env, pieces[1], ctx);
  if (pieces[0] === "api") {
    if (pieces[1] === "mods" && pieces.length === 4 && read)
      return details(
        env,
        pieces[2],
        pieces[3],
        url.searchParams.get("version"),
      );
    if (pieces[1] === "account" && pieces.length === 3)
      return accounts(req, env, pieces[2]);
    if (pieces[1] === "studio") {
      const u = await viewer(req, env),
        [, , res, id, action] = pieces;
      if (res === "mods") {
        if (!id && m === "GET") return studioList(env, u);
        if (!id && m === "POST") return createMod(req, env, u);
        if (id && !action && m === "GET") return studioDetail(env, u, id);
        if (id && action === "uploads" && m === "POST")
          return startUpload(req, env, u, id);
        if (id && action && m === "POST")
          return changeMod(req, env, u, id, action);
      }
      if (res === "uploads" && id) {
        if (action === "finish" && m === "POST")
          return finishUpload(env, u, id);
        if (/^\d{1,2}$/.test(action) && m === "PUT")
          return putPart(req, env, u, id, Number(action));
        if (!action && m === "DELETE") return removeAsset(env, u, id);
      }
    }
    throw new Problem(404, "API route not found.");
  }
  if (!read) throw new Problem(405, "Unsupported method.");
  if (
    p === "/" ||
    /^\/(mods\/[a-f\d]{16}\/[\w-]+|studio(?:\/(?:new|[a-f\d-]{36}))?|account|login|signup|recover)\/?$/i.test(
      p,
    )
  ) {
    const shell = new URL("/index.html", url);
    return env.ASSETS.fetch(new Request(shell, { method: m }));
  }
  return env.ASSETS.fetch(req);
}
export default {
  async fetch(req, env, ctx) {
    let response;
    try {
      response = await route(req, env, ctx);
    } catch (e) {
      if (!(e instanceof Problem))
        console.error(
          "Catalog request failed",
          req.method,
          new URL(req.url).pathname.split("/").slice(0, 3).join("/"),
          e.name,
          String(e.message || "")
            .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]")
            .slice(0, 160),
        );
      response = json(
        {
          error:
            e instanceof Problem
              ? e.message
              : "The catalog is temporarily unavailable. Try again.",
        },
        e instanceof Problem ? e.status : 500,
      );
    }
    const h = new Headers(response.headers);
    if (h.get("Content-Type")?.includes("text/html"))
      h.set("Cache-Control", "no-cache, no-transform");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "same-origin");
    h.set("X-Frame-Options", "DENY");
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    return new Response(req.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers: h,
    });
  },
  async scheduled(_, env) {
    await clean(env);
    await cleanAccounts(env);
  },
};
