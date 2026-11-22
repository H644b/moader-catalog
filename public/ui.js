export const main = document.querySelector("#main");
export const e = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const size = (n) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(1) + " KiB"
      : (n / 1048576).toFixed(1) + " MiB";
const wholeNumber = new Intl.NumberFormat();
export const viewLabel = (n = 0) =>
  wholeNumber.format(n) + (n === 1 ? " view" : " views");
export const date = (v) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(typeof v === "number" ? v * 1000 : v + "T00:00:00Z"));
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sliders:
    '<path d="M3 6h9m5 0h4M3 18h4m5 0h9"/><circle cx="14.5" cy="6" r="2.5"/><circle cx="9.5" cy="18" r="2.5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  user: '<circle cx="12" cy="7.5" r="3.5"/><path d="M4 21v-2a8 6 0 0 1 16 0v2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9"/>',
  game: '<path d="M6 7h12l3 9c1 4-2 5-4 2l-2-2H9l-2 2c-2 3-5 2-4-2l3-9Z"/><path d="M7 11v4m-2-2h4m6-1h.1m2.8 2h.1"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4H4v13h4"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  edit: '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/>',
  sort: '<path d="M7 4v16m-4-5 4 5 4-5m6 5V4m-4 5 4-5 4 5"/>',
  photo:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 6-6 4 3 3-4 4 5"/>',
};
export const icon = (name) =>
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (paths[name] || "") +
  "</svg>";
export async function api(path, { method = "GET", data, raw, signal } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    signal,
    headers: data
      ? { "Content-Type": "application/json" }
      : raw
        ? { "Content-Type": "application/octet-stream" }
        : {},
    body: data ? JSON.stringify(data) : raw,
  });
  let j;
  try {
    j = await res.json();
  } catch {
    j = {};
  }
  if (!res.ok) {
    const err = new Error(j.error || "The request could not be completed.");
    err.status = res.status;
    throw err;
  }
  return j;
}
export const session = api("/api/account/session").then((v) => v.user);
export function nav(u) {
  const n = document.querySelector("#account-nav");
  n.innerHTML = u
    ? '<a class="account-link" href="/account">' +
      icon("user") +
      "<span>" +
      e(u.displayName) +
      "</span></a>"
    : '<a class="sign-link" href="/login">Sign in</a><a class="btn mint small" href="/signup">Sign up ' +
      icon("arrow") +
      "</a>";
  const catalogPage =
    location.pathname === "/" || location.pathname.startsWith("/mods/");
  for (const [id, active] of [
    ["discover-nav", catalogPage],
    ["studio-nav", location.pathname.startsWith("/studio")],
  ]) {
    const link = document.getElementById(id);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
export const image = (m, idx = 0, cls = "") =>
  m.previews?.[idx]
    ? '<img class="' +
      e(cls) +
      '" src="' +
      e(m.previews[idx]) +
      '" alt="' +
      e(m.title) +
      ' preview" decoding="async">'
    : '<div class="no-art ' + e(cls) + '">' + icon("box") + "</div>";
export function errorPage(err) {
  main.innerHTML =
    '<section class="standalone"><h1>' +
    (err.status === 404 ? "Mod unavailable" : "Could not load this page") +
    "</h1><p>" +
    e(err.message) +
    '</p><a class="btn" href="/">Back to Discover</a></section>';
}
export function msg(el, text, bad = false) {
  el.textContent = text;
  el.className = "notice " + (bad ? "bad" : "");
}
export function textField(label, name, value = "", opts = {}) {
  return (
    '<label class="field"><span>' +
    e(label) +
    '</span><input name="' +
    e(name) +
    '" type="' +
    e(opts.type || "text") +
    '" value="' +
    e(value) +
    '" ' +
    (opts.required ? "required " : "") +
    (opts.disabled ? "disabled " : "") +
    (opts.max ? 'maxlength="' + opts.max + '" ' : "") +
    (opts.auto ? 'autocomplete="' + e(opts.auto) + '" ' : "") +
    (opts.hint ? 'placeholder="' + e(opts.hint) + '" ' : "") +
    "></label>"
  );
}
export function crumbs(end, parent = "Discover", href = "/") {
  return (
    '<nav class="crumb" aria-label="Breadcrumb"><a href="' +
    href +
    '">' +
    e(parent) +
    "</a>" +
    icon("right") +
    "<span>" +
    e(end) +
    "</span></nav>"
  );
}
export function needLogin() {
  const p = location.pathname;
  location.replace("/login?next=" + encodeURIComponent(p));
}
export function nextPath() {
  const n = new URLSearchParams(location.search).get("next");
  return n && /^\/(?:studio(?:\/(?:new|[a-f0-9-]{36}))?|account)$/.test(n)
    ? n
    : "/studio";
}
