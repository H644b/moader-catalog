import { api, crumbs, date, e, icon, image, main, msg, size } from "./ui.js";
const by = (id) => document.getElementById(id);
const options = (list, val) =>
  list
    .map(
      ([k, v]) =>
        '<option value="' +
        e(k) +
        '" ' +
        (k === val ? "selected" : "") +
        ">" +
        e(v) +
        "</option>",
    )
    .join("");
function gameLabel(m) {
  return m.sample ? m.game + " · Sample for a fictional game" : m.game;
}
function card(m) {
  return (
    '<a class="mod-card" href="' +
    e(m.path) +
    '"><div class="card-art">' +
    image(m) +
    '</div><div class="card-info"><h3>' +
    e(m.title) +
    '</h3><span class="game-label">' +
    e(gameLabel(m)) +
    '</span><span class="byline">by ' +
    e(m.author) +
    '</span><div class="card-foot"><span>' +
    icon("calendar") +
    e(date(m.published)) +
    "</span><span>" +
    icon("box") +
    size(m.bytes) +
    "</span></div></div></a>"
  );
}
export async function discover() {
  const params = new URLSearchParams(location.search);
  const initial = await api("/api/discover?" + params);
  const hasFilters = [...params.keys()].some(
    (k) => !["sort", "page"].includes(k),
  );
  const featured =
    hasFilters || params.get("page")
      ? []
      : (await api("/api/discover?sort=largest")).items
          .filter((m) => m.previews.length)
          .slice(0, 4);
  main.innerHTML =
    (featured.length
      ? '<section class="spot" aria-label="Featured mods" id="spot"></section>'
      : "") +
    '<section class="browse" aria-labelledby="browse-title"><div class="section-head"><div><h1 id="browse-title">Browse mods</h1><span id="count" class="count"></span></div><a href="/studio/new" class="text-link">' +
    icon("upload") +
    " Publish a mod</a></div>" +
    '<form id="tools" class="tools" role="search"><label class="search"><span class="sr">Search mods</span>' +
    icon("search") +
    '<input type="search" name="q" placeholder="Search mods, games, or creators" value="' +
    e(params.get("q") || "") +
    '"></label><label class="select-shell game-select">' +
    icon("game") +
    '<span class="sr">Game</span><select name="game"><option value="">All games</option>' +
    options(
      initial.games.map((g) => [g.id, g.name]),
      params.get("game"),
    ) +
    "</select>" +
    icon("down") +
    '</label><button type="button" id="filter" class="btn" aria-expanded="false" aria-controls="filters">' +
    icon("sliders") +
    'Filters</button><label class="select-shell sort">' +
    icon("sort") +
    '<span class="sr">Sort mods</span><select name="sort">' +
    options(
      [
        ["newest", "Newest"],
        ["oldest", "Oldest"],
        ["name", "Name A–Z"],
        ["name-desc", "Name Z–A"],
        ["largest", "Largest first"],
        ["smallest", "Smallest first"],
      ],
      params.get("sort") || "newest",
    ) +
    "</select>" +
    icon("down") +
    "</label>" +
    '<div id="filters" class="filter-panel" hidden><label class="field"><span>Category</span><select name="category"><option value="">All categories</option>' +
    options(
      initial.categories.map((c) => [c, c]),
      params.get("category"),
    ) +
    "</select></label>" +
    [
      ["from", "Published from", "date"],
      ["to", "Published through", "date"],
      ["min", "Min size (MiB)", "number"],
      ["max", "Max size (MiB)", "number"],
    ]
      .map(
        ([k, l, t]) =>
          '<label class="field"><span>' +
          l +
          '</span><input name="' +
          k +
          '" type="' +
          t +
          '" ' +
          (t === "number" ? 'min="0" step="any"' : "") +
          ' value="' +
          e(params.get(k) || "") +
          '"></label>',
      )
      .join("") +
    '<button type="button" id="reset" class="subtle">Clear filters</button></div></form><div id="results" aria-busy="false"></div><p id="search-status" class="sr" role="status"></p></section>';
  if (featured.length) {
    const spot = by("spot");
    spot.innerHTML =
      '<div class="spot-art"></div><div class="spot-shade"></div><div class="spot-body"><h2 aria-live="polite"></h2><span class="spot-game">' +
      icon("game") +
      '<span></span></span><p></p><a class="btn mint">View mod ' +
      icon("arrow") +
      "</a></div>" +
      (featured.length > 1
        ? '<div class="spot-pages"><button type="button" data-dir="-1" aria-label="Previous featured mod">' +
          icon("left") +
          '</button><output aria-hidden="true"></output><button type="button" data-dir="1" aria-label="Next featured mod">' +
          icon("right") +
          "</button></div>"
        : "");
    let picked = 0;
    const showFeatured = () => {
      const m = featured[picked];
      spot.querySelector(".spot-art").innerHTML = image(m);
      spot.querySelector("h2").textContent = m.title;
      spot.querySelector(".spot-game span").textContent = gameLabel(m);
      spot.querySelector("p").textContent = m.summary;
      spot.querySelector("a").href = m.path;
      const position = spot.querySelector("output");
      if (position)
        position.textContent =
          String(picked + 1).padStart(2, "0") +
          " / " +
          String(featured.length).padStart(2, "0");
    };
    showFeatured();
    spot.addEventListener("click", (ev) => {
      const arrow = ev.target.closest("[data-dir]");
      if (!arrow) return;
      picked =
        (picked + Number(arrow.dataset.dir) + featured.length) %
        featured.length;
      showFeatured();
    });
  }
  const form = by("tools"),
    filter = by("filter"),
    panel = by("filters");
  function toggle(open) {
    panel.hidden = !open;
    filter.setAttribute("aria-expanded", String(open));
  }
  filter.onclick = () => toggle(panel.hidden);
  if (["category", "from", "to", "min", "max"].some((k) => params.has(k)))
    toggle(true);
  let page = initial.page,
    seq = 0,
    timer;
  function show(value) {
    by("results").innerHTML = value.items.length
      ? '<div class="cards">' + value.items.map(card).join("") + "</div>"
      : '<div class="empty"><h2>No matching mods</h2><p>Try a different search or clear your filters.</p><button class="btn" id="empty-clear">Clear search and filters</button></div>';
    by("count").textContent =
      value.total + " " + (value.total === 1 ? "mod" : "mods");
    by("search-status").textContent = by("count").textContent;
    const pages = Math.ceil(value.total / value.pageSize);
    if (pages > 1)
      by("results").insertAdjacentHTML(
        "beforeend",
        '<nav class="pager"><button id="prev" class="btn" ' +
          (page === 1 ? "disabled" : "") +
          ">Previous</button><span>Page " +
          page +
          " of " +
          pages +
          '</span><button id="next" class="btn" ' +
          (page >= pages ? "disabled" : "") +
          ">Next</button></nav>",
      );
    if (by("prev"))
      by("prev").onclick = () => {
        page--;
        update();
      };
    if (by("next"))
      by("next").onclick = () => {
        page++;
        update();
      };
    if (by("empty-clear")) by("empty-clear").onclick = clear;
  }
  async function update() {
    clearTimeout(timer);
    const id = ++seq;
    if (!form.reportValidity()) return;
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form))
      if (v && !(k === "sort" && v === "newest")) p.set(k, v);
    if (page > 1) p.set("page", page);
    history.replaceState(null, "", "/" + (p.size ? "?" + p : ""));
    by("results").setAttribute("aria-busy", "true");
    try {
      const data = await api("/api/discover?" + p);
      if (id === seq) show(data);
    } catch (err) {
      if (id === seq)
        by("results").innerHTML =
          '<p class="notice bad">' + e(err.message) + "</p>";
    } finally {
      if (id === seq) by("results").setAttribute("aria-busy", "false");
    }
  }
  function clear() {
    for (const el of form.elements)
      if (el.name) el.value = el.name === "sort" ? "newest" : "";
    page = 1;
    update();
  }
  by("reset").onclick = clear;
  form.onsubmit = (ev) => {
    ev.preventDefault();
    page = 1;
    update();
  };
  form.oninput = () => {
    page = 1;
    clearTimeout(timer);
    timer = setTimeout(update, 180);
  };
  show(initial);
}
export async function detail(game, slug) {
  const ver = new URLSearchParams(location.search).get("version");
  const m = await api(
    "/api/mods/" +
      encodeURIComponent(game) +
      "/" +
      encodeURIComponent(slug) +
      (ver ? "?version=" + encodeURIComponent(ver) : ""),
  );
  document.title = m.title + " · Moader";
  main.innerHTML =
    crumbs(m.title) +
    '<article><div class="detail-heading"><div><h1>' +
    e(m.title) +
    '</h1><p class="game-label">' +
    icon("game") +
    e(gameLabel(m)) +
    '</p><p class="byline">by ' +
    e(m.author) +
    '</p></div><a class="btn mint" download href="' +
    e(m.download) +
    '">' +
    icon("download") +
    'Download ZIP</a></div><div class="detail-grid"><div><div class="gallery-main" id="gallery-main">' +
    image(m) +
    '</div><div class="thumbs">' +
    m.previews
      .map(
        (p, i) =>
          '<button aria-label="Show preview ' +
          (i + 1) +
          '" aria-pressed="' +
          !i +
          '" data-img="' +
          i +
          '"><img src="' +
          e(p) +
          '" alt=""></button>',
      )
      .join("") +
    '</div><h2>About this mod</h2><p class="lead">' +
    e(m.summary) +
    '</p><p class="prose">' +
    e(m.description) +
    '</p></div><aside class="facts"><h2>Release details</h2><dl>' +
    [
      ["Version", m.version],
      ["Game", m.game],
      ["Category", m.category],
      ["Published", date(m.published)],
      ["File size", size(m.bytes)],
      ["License", m.license],
      ["Title ID", m.gameId],
    ]
      .map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + e(v) + "</dd></div>")
      .join("") +
    "</dl><details><summary>SHA-256 checksum</summary><code>" +
    e(m.sha256) +
    "</code></details>" +
    (m.source
      ? '<a class="text-link" href="' +
        e(m.source) +
        '" target="_blank" rel="noopener noreferrer">Creator source ' +
        icon("arrow") +
        "</a>"
      : "") +
    '<button class="btn wide" id="share">' +
    icon("copy") +
    'Copy mod link</button><span id="copy-status" class="notice" role="status"></span></aside></div>' +
    (m.versions.length > 1
      ? "<section><h2>Release history</h2>" +
        m.versions
          .map(
            (v) =>
              '<a class="version-row" href="' +
              e(m.path) +
              "?version=" +
              encodeURIComponent(v.version) +
              '">Version ' +
              e(v.version) +
              "<span>" +
              e(date(v.published)) +
              "</span></a>",
          )
          .join("") +
        "</section>"
      : "") +
    "</article>";
  main.querySelectorAll("[data-img]").forEach(
    (b) =>
      (b.onclick = () => {
        by("gallery-main").innerHTML = image(m, Number(b.dataset.img));
        main
          .querySelectorAll("[data-img]")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
  );
  by("share").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      msg(by("copy-status"), "Link copied.");
    } catch {
      msg(by("copy-status"), "Copy the link from your address bar.");
    }
  };
}
