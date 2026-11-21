import { check, MAX_ZIP } from "./common.js";
export const ZIP_TAIL = 2 * 1024 * 1024 + 65557;
const supported = (name) =>
  /^(romfs|exefs|exefs_patches)(\/|$)/.test(name) ||
  ["romfs.bin", "exefs.nsp", "mod.meta"].includes(name);
export function validateZip(tail, total) {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength),
    u16 = (i) => view.getUint16(i, true),
    u32 = (i) => view.getUint32(i, true);
  const valid = (v, msg) => check(v, 422, msg);
  let end = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 65557); i--)
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === tail.length) {
      end = i;
      break;
    }
  valid(end >= 0, "The uploaded file is not a complete ZIP archive.");
  const count = u16(end + 10),
    centralSize = u32(end + 12),
    absolute = u32(end + 16),
    start = end - centralSize;
  valid(
    !u16(end + 4) &&
      !u16(end + 6) &&
      u16(end + 8) === count &&
      count > 0 &&
      count <= 4096 &&
      centralSize <= 2 * 1024 * 1024 &&
      start >= 0 &&
      absolute === total - tail.length + start,
    "Use a single standard ZIP with at most 4,096 entries.",
  );
  let p = start,
    expanded = 0,
    root = null,
    payload = 0;
  const paths = [];
  for (let i = 0; i < count; i++) {
    valid(
      p + 46 <= end && u32(p) === 0x02014b50,
      "The ZIP directory is damaged.",
    );
    const len = u16(p + 28),
      next = p + 46 + len + u16(p + 30) + u16(p + 32),
      size = u32(p + 24),
      kind = (u32(p + 38) >>> 16) & 0xf000;
    valid(
      len > 0 && len <= 256 && next <= end,
      "The archive contains an invalid filename.",
    );
    valid(
      !(u16(p + 8) & 1) &&
        [0, 8].includes(u16(p + 10)) &&
        [0, 0x4000, 0x8000].includes(kind),
      "Use stored or deflated regular files without encryption.",
    );
    expanded += size;
    valid(
      size <= 64 * 1024 * 1024 &&
        expanded <= 256 * 1024 * 1024 &&
        u32(p + 20) <= MAX_ZIP &&
        u32(p + 42) + 30 <= absolute,
      "The ZIP exceeds Moader’s file limits.",
    );
    let name = new TextDecoder().decode(tail.subarray(p + 46, p + 46 + len));
    const dir = name.endsWith("/");
    if (dir) name = name.slice(0, -1);
    p = next;
    valid(
      name.length <= 220 &&
        !/[\\:\x00-\x1f\x7f<>"|?*\ufffd]/.test(name) &&
        name
          .split("/")
          .every((x) => x && x !== "." && x !== ".." && !/[. ]$/.test(x)),
      "The ZIP contains an unsupported SD path.",
    );
    if (
      name === "__MACOSX" ||
      name.startsWith("__MACOSX/") ||
      name.split("/").at(-1) === ".DS_Store"
    )
      continue;
    paths.push({ name, dir });
    if (dir) continue;
    const slash = name.indexOf("/"),
      prefix = supported(name)
        ? ""
        : slash >= 0 && supported(name.slice(slash + 1))
          ? name.slice(0, slash + 1)
          : null;
    valid(
      prefix !== null && (root === null || root === prefix),
      "Put the mod files in romfs/, exefs/ or exefs_patches/, optionally inside one enclosing folder.",
    );
    root = prefix;
    const relative = name.slice(prefix.length);
    if (relative !== "mod.meta") payload++;
  }
  valid(p === end && payload, "The ZIP has no installable game files.");
  const names = new Set();
  for (const { name, dir } of paths) {
    if (dir && name + "/" === root) continue;
    const rel = name.slice(root.length),
      lower = rel.toLowerCase();
    valid(
      name.startsWith(root) && supported(rel) && !names.has(lower),
      "The ZIP contains duplicate paths or files outside its mod folder.",
    );
    valid(
      dir || !["romfs", "exefs", "exefs_patches"].includes(rel),
      "The mod root must be a directory.",
    );
    names.add(lower);
  }
}
// Keep preview dimensions within the Switch image decoder's limits.
function supportedPreview(width, height) {
  return (
    width > 0 &&
    height > 0 &&
    width <= 2048 &&
    height <= 2048 &&
    width * height <= 2097152
  );
}
export function imageType(data) {
  if (data.length < 22) return "";
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) {
    if (
      data.length < 45 ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452 ||
      !supportedPreview(view.getUint32(16), view.getUint32(20))
    )
      return "";
    let hasData = false;
    for (let at = 33; at + 12 <= data.length; ) {
      const bytes = view.getUint32(at),
        kind = view.getUint32(at + 4),
        end = at + 12 + bytes;
      if (end > data.length) return "";
      if (kind === 0x49444154 && bytes > 0) hasData = true;
      if (kind === 0x49454e44)
        return hasData && bytes === 0 && end === data.length ? "image/png" : "";
      at = end;
    }
    return "";
  }
  if (
    view.getUint16(0) !== 0xffd8 ||
    view.getUint16(data.length - 2) !== 0xffd9
  )
    return "";
  let hasFrame = false;
  for (let at = 2; at + 4 < data.length; ) {
    if (data[at++] !== 0xff) return "";
    while (at < data.length && data[at] === 0xff) at++;
    if (at + 3 > data.length) return "";
    const marker = data[at++],
      bytes = view.getUint16(at);
    if (bytes < 2 || at + bytes > data.length) return "";
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (
        bytes < 8 ||
        !supportedPreview(view.getUint16(at + 5), view.getUint16(at + 3))
      )
        return "";
      hasFrame = true;
    }
    if (marker === 0xda) return hasFrame ? "image/jpeg" : "";
    at += bytes;
  }
  return "";
}
