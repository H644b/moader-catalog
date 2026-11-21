import test from "node:test";
import assert from "node:assert/strict";
import { parseRange } from "../src/files.js";
import { validateZip, imageType } from "../src/archive.js";
import { meta, gameOK, slugOK } from "../src/common.js";

test("single, open-ended, suffix and unsatisfiable download ranges", () => {
  assert.deepEqual(parseRange(null, 242), [0, 241, false]);
  assert.deepEqual(parseRange("bytes=128-", 242), [128, 241, true]);
  assert.deepEqual(parseRange("bytes=-30", 242), [212, 241, true]);
  assert.deepEqual(parseRange("bytes=10-999", 242), [10, 241, true]);
  for (const r of [
    "bytes=242-",
    "bytes=-0",
    "bytes=5-4",
    "bytes=",
    "bytes=0-3,7-8",
  ])
    assert.equal(parseRange(r, 242), null);
});
test("catalog requires Switch identities and creator-owned media selections", () => {
  assert.equal(gameOK("0100152000022000"), true);
  assert.equal(gameOK("Mario Kart"), false);
  assert.equal(slugOK("green-hill-zone"), true);
  const input = { title: "Meadow", game: "Orchard", category: "Visuals" };
  assert.equal(meta(input).gallery.length, 0);
  assert.throws(() => meta({ ...input, source: "http://example.org" }));
  assert.throws(() => meta({ ...input, gallery: ["not-a-file"] }));
});
test("rejects incomplete ZIPs and identifies preview formats", () => {
  assert.throws(() => validateZip(new Uint8Array(22), 22), /complete ZIP/);
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+uXcAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  assert.equal(imageType(png), "image/png");
  new DataView(png.buffer).setUint32(16, 4096);
  assert.equal(imageType(png), "");
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0,
    8, 1, 1, 0, 0, 0x3f, 0, 0, 0xff, 0xd9,
  ]);
  assert.equal(imageType(jpeg), "image/jpeg");
  jpeg[9] = 16;
  assert.equal(imageType(jpeg), "");
  assert.equal(imageType(new Uint8Array(30)), "");
});
