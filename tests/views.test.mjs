import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";
import { catalogDB } from "./catalog-db.mjs";

test("mod views leave public reads untouched and deduplicate each browser per UTC day", async (t) => {
  const env = await catalogDB(t);
  const origin = env.PUBLIC_ORIGIN;
  const request = (path, init) => worker.fetch(new Request(origin + path, init), env, {});
  const get = async (path) => {
    const response = await request(path);
    assert.equal(response.status, 200);
    return response.json();
  };
  const record = (id, visitor, source = origin) => request("/api/mods/" + id + "/view", {
    method: "POST",
    headers: { Origin: source, "Content-Type": "application/json" },
    body: JSON.stringify({ visitor }),
  });
  const [mod, other] = (await get("/api/discover")).items;
  const details = "/api" + mod.path;
  const visit = crypto.randomUUID();
  const today = Date.now();
  const clock = t.mock.method(Date, "now", () => today);
  assert.equal(mod.views, 0);
  await get("/catalog.json");
  await get("/api/discover?q=" + encodeURIComponent(mod.title));
  assert.equal((await request(details, { method: "HEAD" })).status, 200);
  assert.equal((await request(new URL(mod.download).pathname, { method: "HEAD" })).status, 200);
  assert.equal((await get(details)).views, 0);
  assert.equal((await record(mod.id, visit, "https://other.test")).status, 403);
  assert.equal((await record(mod.id, "")).status, 400);
  assert.equal((await record(crypto.randomUUID(), visit)).status, 404);

  const duplicates = await Promise.all(Array.from({ length: 8 }, () => record(mod.id, visit)));
  for (const response of duplicates) assert.deepEqual(await response.json(), { views: 1 });
  assert.equal((await get(details + "?version=" + mod.version)).views, 1);
  assert.equal((await get("/api" + other.path)).views, 0);
  const newVisitors = await Promise.all(Array.from({ length: 4 }, () => record(mod.id, crypto.randomUUID())));
  for (const response of newVisitors) assert.equal(response.status, 200);
  assert.equal((await get(details)).views, 5);
  assert.deepEqual(await (await record(other.id, visit)).json(), { views: 1 });
  assert.equal((await get("/api/discover")).items.find(m => m.id === mod.id).views, 5);

  await env.DB.prepare("UPDATE mods SET listed=0 WHERE id=?").bind(mod.id).run();
  assert.equal((await record(mod.id, crypto.randomUUID())).status, 404);
  await env.DB.prepare("UPDATE mods SET listed=1 WHERE id=?").bind(mod.id).run();
  assert.deepEqual(await (await record(mod.id, visit)).json(), { views: 5 });
  clock.mock.mockImplementation(() => today + 86400000);
  assert.deepEqual(await (await record(mod.id, visit)).json(), { views: 6 });
  await env.DB.prepare("UPDATE mods SET deleted=1 WHERE id=?").bind(mod.id).run();
  assert.equal((await record(mod.id, crypto.randomUUID())).status, 404);
  assert.equal((await get("/api" + other.path)).views, 1);
});
