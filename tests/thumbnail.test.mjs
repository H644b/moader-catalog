import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import {
  changeMod,
  details,
  feed,
  removeAsset,
  studioDetail,
} from "../src/catalog.js";
import { serveFile } from "../src/files.js";

test("a creator can delete a thumbnail shared by draft and published galleries", async (t) => {
  const { env, dispose } = await getPlatformProxy({
    persist: false,
    remoteBindings: false,
  });
  t.after(dispose);
  for (const name of ["0001_catalog", "0002_starters"]) {
    const schema = await readFile(
      new URL("../migrations/" + name + ".sql", import.meta.url),
      "utf8",
    );
    await env.DB.batch(
      schema
        .trim()
        .split(/;\s*(?:\n|$)/)
        .filter((s) => s.trim())
        .map((s) => env.DB.prepare(s)),
    );
  }
  const row = await env.DB.prepare(
    "SELECT * FROM mods WHERE slug='orchard-palette'",
  ).first();
  const owner = { id: row.owner, display_name: "Sample workshop" };
  let mod = await (await studioDetail(env, owner, row.id)).json();
  const [cover, next] = mod.draft.gallery;
  const pkg = mod.draft.package;
  const publicVersion = async (version) =>
    (await details(env, row.game_id, row.slug, version)).json();
  const original = await publicVersion("1.0.0");
  const change = async (action, input, user = owner) => {
    const req = new Request("https://catalog.test/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: mod.revision, ...input }),
    });
    return (await changeMod(req, env, user, row.id, action)).json();
  };

  mod = await change("save", { draft: { ...mod.draft, version: "1.1.0" } });
  mod = await change("publish", {});
  assert.equal(mod.assets.find((a) => a.id === cover).releaseCount, 2);
  mod = await change("save", { draft: { ...mod.draft, gallery: [next] } });
  const previousRevision = mod.revision;
  await assert.rejects(removeAsset(env, owner, cover), { status: 409 });
  await assert.rejects(change("delete-thumbnail", { assetId: pkg }), {
    status: 404,
  });
  await assert.rejects(
    change("delete-thumbnail", { assetId: cover }, { id: "another-creator" }),
    { status: 404 },
  );
  const otherImage = await env.DB.prepare(
    "SELECT id FROM assets WHERE kind='image' AND mod_id<>? LIMIT 1",
  )
    .bind(row.id)
    .first("id");
  await assert.rejects(change("delete-thumbnail", { assetId: otherImage }), {
    status: 404,
  });

  mod = await change("delete-thumbnail", { assetId: cover });
  assert.deepEqual(mod.draft.gallery, [next]);
  assert.equal(mod.draft.package, pkg);
  assert.ok(!mod.assets.some((a) => a.id === cover));
  assert.equal(mod.revision, previousRevision + 1);
  await assert.rejects(
    change("save", {
      revision: previousRevision,
      draft: { ...mod.draft, gallery: [cover] },
    }),
    { status: 409 },
  );
  await assert.rejects(
    serveFile(
      new Request(original.previews[0], { method: "HEAD" }),
      env,
      cover,
    ),
    { status: 404 },
  );
  for (const version of ["1.0.0", "1.1.0"]) {
    const release = await publicVersion(version);
    assert.deepEqual(release.previews, [original.previews[1]]);
    assert.equal(release.download, original.download);
    assert.equal(release.sha256, original.sha256);
    const meta = await env.DB.prepare(
      "SELECT meta FROM releases WHERE mod_id=? AND version=?",
    )
      .bind(row.id, version)
      .first("meta");
    assert.deepEqual(JSON.parse(meta).gallery, [next]);
  }
  const consoleFeed = await (
    await feed(new URL("https://catalog.test/catalog.json"), env)
  ).json();
  assert.deepEqual(
    consoleFeed.games.find((g) => g.titleId === row.game_id).mods[0].previews,
    [original.previews[1]],
  );
  // The last thumbnail is still selected in the draft. Its package stays downloadable.
  mod = await change("delete-thumbnail", { assetId: next });
  assert.deepEqual(mod.draft.gallery, []);
  assert.deepEqual((await publicVersion("1.0.0")).previews, []);
  assert.deepEqual((await publicVersion("1.1.0")).previews, []);
  assert.equal(
    (
      await serveFile(
        new Request(original.download, { method: "HEAD" }),
        env,
        pkg,
      )
    ).status,
    200,
  );
  await assert.rejects(removeAsset(env, owner, pkg), { status: 409 });
});
