import {
  body,
  bytes,
  check,
  hash,
  hex,
  json,
  now,
  uid,
  all,
  field,
  CHUNK,
  MAX_IMAGE,
  MAX_ZIP,
  safeFile,
} from "./common.js";
import { imageType, validateZip, ZIP_TAIL } from "./archive.js";
import { viewer } from "./auth.js";
const storage = (env, tail) =>
  env.SUPABASE_URL + "/storage/v1/object/" + env.BUCKET + "/" + tail;
const credentials = (env) => ({
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
});
const key = (id, n, sha) => id + "/" + n + "-" + sha;
export async function ownMod(env, u, id) {
  const m = await env.DB.prepare(
    "SELECT * FROM mods WHERE id=? AND owner=? AND deleted IS NULL",
  )
    .bind(id, u.id)
    .first();
  check(m, 404, "Mod not found in your studio.");
  return m;
}
async function ownedAsset(env, u, id) {
  const a = await env.DB.prepare(
    "SELECT a.* FROM assets a JOIN mods m ON m.id=a.mod_id WHERE a.id=? AND m.owner=? AND m.deleted IS NULL AND a.state!='garbage'",
  )
    .bind(id, u.id)
    .first();
  check(a, 404, "Upload not found.");
  return a;
}
export async function startUpload(req, env, u, modId) {
  await ownMod(env, u, modId);
  const b = await body(req),
    kind = b.kind,
    size = b.bytes;
  const mime = kind === "package" ? "application/octet-stream" : b.mime;
  check(
    ["package", "image"].includes(kind) &&
      Number.isSafeInteger(size) &&
      size > 0 &&
      size <= (kind === "package" ? MAX_ZIP : MAX_IMAGE),
    400,
    "Choose a ZIP up to 128 MiB or an image up to 2 MiB.",
  );
  check(
    kind === "package"
      ? size >= 22
      : ["image/png", "image/jpeg"].includes(mime),
    400,
    "Use a ZIP package or a JPG or PNG preview.",
  );
  const name = safeFile(field(b.name, "filename", 180)),
    id = uid(),
    parts = Math.ceil(size / CHUNK);
  const r = await env.DB.prepare(
    "INSERT INTO assets(id,mod_id,kind,name,mime,bytes,parts,created) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(sum(a.bytes),0) FROM assets a JOIN mods m ON m.id=a.mod_id WHERE m.owner=?) + ? <= 1073741824 AND (SELECT count(*) FROM assets WHERE mod_id=? AND state='pending') < 18",
  )
    .bind(id, modId, kind, name, mime, size, parts, now(), u.id, size, modId)
    .run();
  check(
    r.meta.changes === 1,
    409,
    "Your storage or pending upload limit has been reached. Remove unused files or finish pending uploads.",
  );
  return json({ id, chunkSize: CHUNK, parts }, 201);
}
export async function putPart(req, env, u, id, n) {
  const a = await ownedAsset(env, u, id);
  check(
    a.state === "pending" && Number.isSafeInteger(n) && n >= 0 && n < a.parts,
    409,
    "This upload part is unavailable.",
  );
  const wanted = Math.min(CHUNK, a.bytes - n * CHUNK),
    data = await bytes(req, wanted);
  check(data.length === wanted, 400, "This upload part is incomplete.");
  const sha = await hash(data);
  await env.DB.prepare(
    "INSERT INTO parts(asset_id,n,sha,bytes) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
  )
    .bind(id, n, sha, wanted)
    .run();
  const part = await env.DB.prepare(
    "SELECT sha,ready FROM parts WHERE asset_id=? AND n=?",
  )
    .bind(id, n)
    .first();
  check(
    part?.sha === sha,
    409,
    "Different bytes were already supplied for this part.",
  );
  if (!part.ready) {
    const dest = storage(env, key(id, n, sha)),
      headers = {
        ...credentials(env),
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
      };
    const response = await fetch(dest, {
      method: "POST",
      headers,
      body: data,
      redirect: "manual",
    });
    check(
      response.ok,
      502,
      "Storage could not save this part. Retry the upload.",
    );
    await env.DB.prepare(
      "UPDATE parts SET ready=1 WHERE asset_id=? AND n=? AND sha=?",
    )
      .bind(id, n, sha)
      .run();
  }
  return json({ received: wanted });
}
async function fetchPart(env, id, part, range) {
  const headers = credentials(env);
  if (range) headers.Range = range;
  const r = await fetch(storage(env, key(id, part.n, part.sha)), {
    headers,
    redirect: "manual",
  });
  if (!r.ok) {
    console.warn("Private storage read returned", r.status);
    check(
      false,
      502,
      "Stored file temporarily unavailable (" + r.status + ").",
    );
  }
  return r;
}
export async function finishUpload(env, u, id) {
  const a = await ownedAsset(env, u, id);
  if (a.state === "ready") return json(a);
  const parts = await all(
    env.DB.prepare(
      "SELECT n,sha,bytes FROM parts WHERE asset_id=? AND ready=1 ORDER BY n",
    ).bind(id),
  );
  check(parts.length === a.parts, 409, "Finish uploading all parts first.");
  const digest = new crypto.DigestStream("SHA-256"),
    writer = digest.getWriter();
  let tail = new Uint8Array(0),
    n = 0;
  try {
    for (const p of parts) {
      const data = new Uint8Array(
        await (await fetchPart(env, id, p)).arrayBuffer(),
      );
      check(
        data.length === p.bytes,
        502,
        "Stored part is incomplete. Retry finishing the upload.",
      );
      await writer.write(data);
      n += data.length;
      if (data.length >= ZIP_TAIL) tail = data.slice(-ZIP_TAIL);
      else {
        const old = tail.subarray(
            Math.max(0, tail.length + data.length - ZIP_TAIL),
          ),
          joined = new Uint8Array(old.length + data.length);
        joined.set(old);
        joined.set(data, old.length);
        tail = joined;
      }
    }
    check(n === a.bytes, 422, "Package size verification failed.");
    if (a.kind === "package") validateZip(tail, n);
    else
      check(
        imageType(tail) === a.mime,
        422,
        "Use a PNG or JPEG up to 2 megapixels and 2,048 pixels per side.",
      );
    await writer.close();
  } catch (e) {
    await writer.abort().catch(() => {});
    digest.digest.catch(() => {});
    throw e;
  }
  const sha = hex(await digest.digest);
  const done = await env.DB.prepare(
    "UPDATE assets SET sha=?,state='ready' WHERE id=? AND state IN ('pending','ready') RETURNING id,name,mime,bytes,kind,sha,state",
  )
    .bind(sha, id)
    .first();
  check(done, 409, "Upload was removed.");
  return json(done);
}
export function parseRange(value, size) {
  if (!value) return [0, size - 1, false];
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])),
    end = m[1]
      ? m[2]
        ? Math.min(size - 1, Number(m[2]))
        : size - 1
      : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end &&
    start < size
    ? [start, end, true]
    : null;
}
export async function serveFile(req, env, id, ctx) {
  const a = await env.DB.prepare(
    `SELECT a.*,m.owner, EXISTS(SELECT 1 FROM releases r JOIN mods m2 ON m2.id=r.mod_id
 WHERE m2.listed=1 AND m2.deleted IS NULL AND (r.package_id=a.id OR EXISTS(SELECT 1 FROM gallery g WHERE g.release_id=r.id AND g.asset_id=a.id))) AS public
 FROM assets a JOIN mods m ON m.id=a.mod_id WHERE a.id=? AND a.state='ready' AND m.deleted IS NULL`,
  )
    .bind(id)
    .first();
  check(a, 404, "File not found.");
  if (!a.public) {
    const u = await viewer(req, env, false);
    check(u?.id === a.owner, 404, "File not found.");
  }
  const etag = '"' + a.sha + '"',
    headers = {
      "Content-Type": a.kind === "package" ? "application/zip" : a.mime,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition":
        (a.kind === "package" ? "attachment" : "inline") +
        '; filename="' +
        safeFile(a.name) +
        '"',
      "Cache-Control": a.public
        ? "public, max-age=0, must-revalidate"
        : "private, no-store",
      ...(a.public ? { "Access-Control-Allow-Origin": "*" } : {}),
      ETag: etag,
    };
  if (req.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers });
  const range = parseRange(req.headers.get("Range"), a.bytes);
  if (!range)
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": "bytes */" + a.bytes },
    });
  const [start, end, partial] = range,
    needed = end - start + 1;
  headers["Content-Length"] = String(needed);
  if (partial)
    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + a.bytes;
  if (req.method === "HEAD")
    return new Response(null, { status: partial ? 206 : 200, headers });
  const parts = await all(
    env.DB.prepare(
      "SELECT n,sha,bytes FROM parts WHERE asset_id=? AND n BETWEEN ? AND ? AND ready=1 ORDER BY n",
    ).bind(id, Math.floor(start / CHUNK), Math.floor(end / CHUNK)),
  );
  check(
    parts.length === Math.floor(end / CHUNK) - Math.floor(start / CHUNK) + 1,
    503,
    "File is temporarily unavailable.",
  );
  async function get(p) {
    const lo = Math.max(0, start - p.n * CHUNK),
      hi = Math.min(p.bytes - 1, end - p.n * CHUNK);
    const r = await fetchPart(
      env,
      id,
      p,
      lo || hi !== p.bytes - 1 ? "bytes=" + lo + "-" + hi : null,
    );
    if (r.status === 200 && (lo || hi !== p.bytes - 1)) {
      const b = new Uint8Array(await r.arrayBuffer());
      check(b.length === p.bytes, 502, "Incomplete storage response.");
      return new Response(b.subarray(lo, hi + 1));
    }
    return r;
  }
  const first = await get(parts[0]);
  if (parts.length === 1)
    return new Response(first.body, { status: partial ? 206 : 200, headers });
  const fixed = new FixedLengthStream(needed);
  const pump = async () => {
    try {
      for (let i = 0; i < parts.length; i++) {
        const r = i === 0 ? first : await get(parts[i]);
        await r.body.pipeTo(fixed.writable, { preventClose: true });
      }
      await fixed.writable.close();
    } catch (err) {
      console.warn(
        "Download interrupted",
        err.name,
        err.message?.slice(0, 100),
      );
      await fixed.writable.abort(err).catch(() => {});
    }
  };
  ctx.waitUntil(pump());
  return new Response(fixed.readable, { status: partial ? 206 : 200, headers });
}
export async function clean(env) {
  const stamp = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(stamp),
    env.DB.prepare("DELETE FROM limits WHERE expires<?").bind(stamp),
    env.DB.prepare(
      "UPDATE assets SET state='garbage' WHERE state='pending' AND created<?",
    ).bind(stamp - 86400),
  ]);
  const garbage = await all(
    env.DB.prepare(
      "SELECT a.id FROM assets a JOIN mods m ON m.id=a.mod_id WHERE a.state='garbage' OR m.deleted<? LIMIT 4",
    ).bind(stamp - 86400),
  );
  for (const a of garbage) {
    const parts = await all(
      env.DB.prepare("SELECT n,sha FROM parts WHERE asset_id=?").bind(a.id),
    );
    if (parts.length) {
      const r = await fetch(
        env.SUPABASE_URL + "/storage/v1/object/" + env.BUCKET,
        {
          method: "DELETE",
          redirect: "manual",
          headers: { ...credentials(env), "Content-Type": "application/json" },
          body: JSON.stringify({
            prefixes: parts.map((p) => key(a.id, p.n, p.sha)),
          }),
        },
      );
      if (!r.ok) continue;
    }
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM releases WHERE mod_id IN (SELECT id FROM mods WHERE deleted IS NOT NULL AND id=(SELECT mod_id FROM assets WHERE id=?))",
      ).bind(a.id),
      env.DB.prepare("DELETE FROM assets WHERE id=?").bind(a.id),
    ]);
  }
  // Retain the object inventory until storage confirms removal.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM mods WHERE id IN (
      SELECT m.id FROM mods m WHERE m.deleted < ?
      AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.mod_id=m.id) LIMIT 50
    )`).bind(stamp - 86400),
    env.DB.prepare(`DELETE FROM creators WHERE id IN (
      SELECT c.id FROM creators c WHERE c.auth_email IS NULL AND c.handle='deleted-' || c.id
      AND NOT EXISTS (SELECT 1 FROM mods m WHERE m.owner=c.id)
      AND NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.id=c.id) LIMIT 50
    )`),
  ]);
}
