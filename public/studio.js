import {
  api,
  crumbs,
  date,
  e,
  icon,
  main,
  msg,
  needLogin,
  size,
  textField,
} from "./ui.js";
const el = (id) => document.getElementById(id);
export async function studio(u) {
  if (!u) return needLogin();
  const data = await api("/api/studio/mods");
  document.title = "Creator studio · Moader";
  main.innerHTML =
    '<div class="page-title"><h1>Creator studio</h1><a class="btn mint" href="/studio/new">' +
    icon("plus") +
    'New mod</a></div><section><div class="section-head"><div><h2>Your mods</h2><span class="count">' +
    data.mods.length +
    "</span></div></div>" +
    (data.mods.length
      ? '<div class="studio-list">' +
        data.mods
          .map(
            (m) =>
              '<a href="/studio/' +
              e(m.id) +
              '" class="studio-row"><span class="studio-glyph">' +
              icon("box") +
              '</span><span class="row-name"><strong>' +
              e(m.draft.title) +
              "</strong><small>" +
              e(m.draft.game) +
              '</small></span><span class="state ' +
              (m.listed ? "live" : "") +
              '">' +
              (m.listed ? "Published" : "Draft") +
              '</span><span class="row-date">' +
              e(date(m.updated)) +
              "</span>" +
              icon("right") +
              "</a>",
          )
          .join("") +
        "</div>"
      : '<div class="empty studio-empty">' +
        icon("upload") +
        "<h2>Publish your first mod</h2><p>Add game details, a ZIP and preview images to create your listing.</p></div>") +
    "</section>";
}
const slugify = (s) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
export async function editor(u, id) {
  if (!u) return needLogin();
  let model = id
    ? await api("/api/studio/mods/" + id)
    : {
        id: null,
        gameId: "",
        slug: "",
        revision: 0,
        listed: false,
        assets: [],
        versions: [],
        draft: {
          title: "",
          game: "",
          category: "",
          summary: "",
          description: "",
          license: "",
          version: "1.0.0",
          source: "",
          package: null,
          gallery: [],
        },
      };
  document.title = (model.id ? "Edit mod" : "New mod") + " · Moader";
  const choices = await api("/api/discover");
  const d = model.draft;
  main.innerHTML =
    crumbs(model.id ? d.title : "New mod", "Creator studio", "/studio") +
    '<div class="page-title"><div><h1>' +
    (model.id ? "Edit mod" : "New mod") +
    '</h1><p id="edit-subtitle" class="muted">' +
    (model.listed
      ? "Changes stay in your draft until you publish."
      : "Build your listing and publish when it is ready.") +
    '</p></div><a class="text-link" id="public-link" hidden>View public listing ' +
    icon("arrow") +
    '</a></div><form id="editor"><div class="edit-layout"><div class="edit-main"><section class="sheet"><h2>Mod details</h2>' +
    textField("Mod name", "title", d.title, { required: true, max: 120 }) +
    '<div class="duo"><label class="field"><span>Game</span><input name="game" required maxlength="160" list="known-games" value="' +
    e(d.game) +
    '"><datalist id="known-games">' +
    choices.games.map((g) => '<option value="' + e(g.name) + '">').join("") +
    "</datalist></label>" +
    textField("Game Title ID", "gameId", model.gameId, {
      required: true,
      max: 16,
      disabled: !!id,
      hint: "16 hexadecimal characters",
    }) +
    '</div><div class="duo">' +
    textField("Mod ID", "slug", model.slug, {
      required: true,
      max: 48,
      disabled: !!id,
      hint: "my-mod",
    }) +
    '<label class="field"><span>Category</span><input required name="category" maxlength="40" list="categories" value="' +
    e(d.category) +
    '"><datalist id="categories">' +
    [
      ...new Set([
        "Courses",
        "Visuals",
        "Audio",
        "Gameplay",
        "Translations",
        "Other",
        ...choices.categories,
      ]),
    ]
      .map((c) => '<option value="' + e(c) + '">')
      .join("") +
    "</datalist></label></div>" +
    textField("Short summary", "summary", d.summary, { max: 380 }) +
    '<label class="field"><span>Description</span><textarea name="description" rows="6" maxlength="4000">' +
    e(d.description) +
    '</textarea></label></section><section class="sheet"><h2>Package and previews</h2><div id="package-list"></div><label class="drop"><span>' +
    icon("upload") +
    'Choose a mod ZIP</span><small>Up to 128 MiB. Use a Moader-compatible game folder such as romfs/.</small><input type="file" id="zip-file" accept=".zip,application/zip"></label><h3>Preview gallery</h3><div id="media-list"></div><label class="drop compact"><span>' +
    icon("photo") +
    'Add preview images</span><small>JPG or PNG, up to 2 MiB each. 1920 × 1080 works on Switch. The first image is your cover.</small><input type="file" multiple id="image-file" accept="image/png,image/jpeg"></label><progress id="progress" max="100" value="0" hidden></progress><p class="notice" id="upload-status" role="status"></p></section></div><aside><section class="sheet"><h2>Release</h2>' +
    textField("Version", "version", d.version, { max: 48 }) +
    textField("License", "license", d.license, {
      max: 96,
      hint: "e.g. CC BY 4.0",
    }) +
    textField("Creator source (optional)", "source", d.source, {
      type: "url",
      max: 650,
      hint: "https://",
    }) +
    '<p class="notice" id="save-status" role="status"></p><button class="btn mint wide" name="publish" type="submit" value="publish">' +
    icon("upload") +
    'Publish release</button><button class="btn wide" type="submit" value="save">Save draft</button></section><section class="sheet" id="manage"></section></aside></div></form>';
  const form = el("editor");
  let busy = false,
    selection = { package: d.package, gallery: [...d.gallery] },
    manualSlug = !!id;
  form.elements.slug.oninput = () => {
    manualSlug = true;
  };
  form.elements.title.oninput = () => {
    if (!manualSlug)
      form.elements.slug.value = slugify(form.elements.title.value);
  };
  let suggestedGameId = "";
  form.elements.game.onchange = () => {
    const gameId = form.elements.gameId;
    if (gameId.disabled || (gameId.value && gameId.value !== suggestedGameId))
      return;
    const game = choices.games.find(
      (g) =>
        g.name.toLowerCase() === form.elements.game.value.trim().toLowerCase(),
    );
    suggestedGameId = game?.id || "";
    gameId.value = suggestedGameId;
  };
  function syncInfo() {
    if (model.id) {
      document.title = "Edit mod · Moader";
      main.querySelector(".page-title h1").textContent = "Edit mod";
      const trail = main.querySelector(".crumb span:last-child");
      if (trail) trail.textContent = model.draft.title;
      el("edit-subtitle").textContent = model.listed
        ? "Changes stay in your draft until you publish."
        : "Build your listing and publish when it is ready.";
    }
    const l = el("public-link");
    l.hidden = !model.listed;
    l.href = "/mods/" + model.gameId + "/" + model.slug;
    form.elements.gameId.disabled = !!model.id;
    form.elements.slug.disabled = !!model.id;
    const manage = el("manage");
    manage.hidden = !model.id;
    manage.innerHTML =
      '<h2>Manage mod</h2><p class="muted">' +
      (model.listed
        ? "Available in the public catalog."
        : "Only you can see this draft.") +
      "</p>" +
      (model.listed
        ? '<button class="btn wide" type="button" id="unpublish">Unpublish mod</button>'
        : "") +
      '<button type="button" class="danger-link" id="delete-mod">Delete mod</button>' +
      (model.versions.length
        ? "<h3>Published versions</h3><ul>" +
          model.versions
            .map(
              (v) =>
                "<li>" + e(v.version) + " · " + e(date(v.published)) + "</li>",
            )
            .join("") +
          "</ul>"
        : "");
    if (el("unpublish"))
      el("unpublish").onclick = () =>
        management(
          "unpublish",
          "Unpublish this mod? Its public listing and downloads will be taken offline.",
        );
    el("delete-mod").onclick = () =>
      management(
        "delete",
        "Delete this mod and its releases? This cannot be undone.",
      );
  }
  function renderMedia() {
    const a = model.assets.find((x) => x.id === selection.package);
    el("package-list").innerHTML = a
      ? '<p class="file-row">' +
        icon("box") +
        "<strong>" +
        e(a.name) +
        "</strong> " +
        size(a.bytes) +
        "</p>"
      : "";
    el("media-list").innerHTML = selection.gallery
      .map((asset, i) => {
        const img = model.assets.find((x) => x.id === asset);
        return img
          ? '<div class="media-row"><img src="' +
              e(img.url) +
              '" alt="Preview ' +
              (i + 1) +
              '"><span>' +
              e(img.name) +
              '</span><button type="button" data-move="' +
              i +
              '" title="Move preview earlier" aria-label="Move preview earlier" ' +
              (!i ? "disabled" : "") +
              ">" +
              icon("left") +
              '</button><button type="button" data-drop="' +
              i +
              '" title="Remove from draft" aria-label="Remove preview from draft">' +
              icon("x") +
              "</button>" +
              deleteThumbnailButton(img) +
              "</div>"
          : "";
      })
      .join("");
    el("media-list")
      .querySelectorAll("[data-drop]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            selection.gallery.splice(Number(b.dataset.drop), 1);
            renderMedia();
            msg(
              el("upload-status"),
              "Removed from the draft gallery. Save draft to keep this change.",
            );
          }),
      );
    el("media-list")
      .querySelectorAll("[data-move]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const i = Number(b.dataset.move);
            [selection.gallery[i], selection.gallery[i - 1]] = [
              selection.gallery[i - 1],
              selection.gallery[i],
            ];
            renderMedia();
          }),
      );
    const unused = model.assets.filter(
      (a) => a.id !== selection.package && !selection.gallery.includes(a.id),
    );
    if (unused.length) {
      el("media-list").insertAdjacentHTML(
        "beforeend",
        "<details><summary>Other uploaded files (" +
          unused.length +
          ")</summary>" +
          unused
            .map(
              (a) =>
                '<div class="file-row"><span>' +
                e(a.name) +
                '</span><button type="button" class="subtle" data-use="' +
                e(a.id) +
                '">Use</button>' +
                (a.kind === "image"
                  ? deleteThumbnailButton(a)
                  : '<button type="button" class="subtle" data-del="' +
                    e(a.id) +
                    '">Remove</button>') +
                "</div>",
            )
            .join("") +
          "</details>",
      );
    }
    el("media-list")
      .querySelectorAll("[data-use]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const a = model.assets.find((x) => x.id === b.dataset.use);
            if (a.kind === "package") selection.package = a.id;
            else if (selection.gallery.length < 8) selection.gallery.push(a.id);
            renderMedia();
          }),
      );
    el("media-list")
      .querySelectorAll("[data-delete-thumbnail]")
      .forEach((button) => {
        button.onclick = () =>
          deleteThumbnail(
            model.assets.find(
              (asset) => asset.id === button.dataset.deleteThumbnail,
            ),
          );
      });
    el("media-list")
      .querySelectorAll("[data-del]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            run(async () => {
              await save();
              await api("/api/studio/uploads/" + b.dataset.del, {
                method: "DELETE",
              });
              model = await api("/api/studio/mods/" + model.id);
              renderMedia();
            }, "upload-status")),
      );
  }
  function deleteThumbnailButton(asset) {
    return (
      '<button type="button" class="subtle thumbnail-delete" data-delete-thumbnail="' +
      e(asset.id) +
      '" title="Delete thumbnail" aria-label="Delete thumbnail ' +
      e(asset.name) +
      '">Delete</button>'
    );
  }
  function deleteThumbnail(asset) {
    const releases = asset.releaseCount;
    const scope = releases
      ? "your uploads, your draft and " +
        releases +
        " published " +
        (releases === 1 ? "version" : "versions")
      : "your uploads and draft";
    if (
      !window.confirm(
        'Delete "' +
          asset.name +
          '" from ' +
          scope +
          "? This takes effect immediately.",
      )
    )
      return;
    return run(async () => {
      model = await api("/api/studio/mods/" + model.id + "/delete-thumbnail", {
        method: "POST",
        data: { assetId: asset.id, revision: model.revision },
      });
      selection.gallery = selection.gallery.filter((id) => id !== asset.id);
      msg(el("upload-status"), "Thumbnail deleted.");
    }, "upload-status");
  }
  function values() {
    const obj = {};
    for (const k of [
      "title",
      "game",
      "category",
      "version",
      "license",
      "source",
      "summary",
      "description",
    ])
      obj[k] = form.elements[k].value;
    return { ...obj, ...selection };
  }
  async function save() {
    if (!form.reportValidity())
      throw new Error("Complete the highlighted field first.");
    const metadata = values();
    if (!model.id) {
      model = await api("/api/studio/mods", {
        method: "POST",
        data: {
          ...metadata,
          gameId: form.elements.gameId.value,
          slug: form.elements.slug.value,
        },
      });
      history.replaceState(null, "", "/studio/" + model.id);
    } else
      model = await api("/api/studio/mods/" + model.id + "/save", {
        method: "POST",
        data: { revision: model.revision, draft: metadata },
      });
    syncInfo();
    return model;
  }
  function lock(on) {
    busy = on;
    form.setAttribute("aria-busy", String(on));
    form
      .querySelectorAll("button,input[type=file]")
      .forEach((b) => (b.disabled = on));
    if (!on) {
      renderMedia();
      syncInfo();
    }
  }
  async function run(fn, status = "save-status") {
    if (busy) return;
    lock(true);
    const out = el(status);
    msg(out, "");
    try {
      await fn();
    } catch (err) {
      msg(out, err.message, true);
    } finally {
      lock(false);
    }
  }
  async function management(action, prompt) {
    if (!window.confirm(prompt)) return;
    await run(async () => {
      const v = await api("/api/studio/mods/" + model.id + "/" + action, {
        method: "POST",
        data: { revision: model.revision },
      });
      if (action === "delete") location.assign("/studio");
      else {
        model = v;
        syncInfo();
        msg(el("save-status"), "Mod unpublished.");
      }
    });
  }
  async function upload(file, kind) {
    if (kind === "image" && selection.gallery.length >= 8)
      throw new Error("The gallery already has eight previews.");
    if (file.size > (kind === "image" ? 2 : 128) * 1048576)
      throw new Error("The selected file is too large.");
    const a = await api("/api/studio/mods/" + model.id + "/uploads", {
        method: "POST",
        data: { kind, name: file.name, bytes: file.size, mime: file.type },
      }),
      bar = el("progress");
    const previousSelection = {
      package: selection.package,
      gallery: [...selection.gallery],
    };
    try {
      bar.hidden = false;
      bar.value = 0;
      for (let i = 0; i < a.parts; i++) {
        const part = file.slice(
          i * a.chunkSize,
          Math.min((i + 1) * a.chunkSize, file.size),
        );
        let done = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await api("/api/studio/uploads/" + a.id + "/" + i, {
              method: "PUT",
              raw: part,
            });
            done = true;
            break;
          } catch (err) {
            if (attempt === 2 || (err.status < 500 && err.status)) throw err;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        if (done) {
          bar.value = Math.round(((i + 1) / a.parts) * 100);
          msg(
            el("upload-status"),
            "Uploading " + file.name + " · " + bar.value + "%",
          );
        }
      }
      msg(el("upload-status"), "Checking " + file.name + "…");
      await api("/api/studio/uploads/" + a.id + "/finish", {
        method: "POST",
        data: {},
      });
      if (kind === "package") selection.package = a.id;
      else selection.gallery.push(a.id);
      await save();
      renderMedia();
    } catch (err) {
      selection = previousSelection;
      await api("/api/studio/uploads/" + a.id, { method: "DELETE" }).catch(
        () => {},
      );
      throw err;
    } finally {
      bar.hidden = true;
    }
  }
  for (const [key, kind] of [
    ["zip-file", "package"],
    ["image-file", "image"],
  ])
    el(key).onchange = () => {
      const files = [...el(key).files];
      if (files.length)
        run(async () => {
          await save();
          for (const file of files) await upload(file, kind);
          msg(el("upload-status"), "Files verified and saved to your draft.");
        }, "upload-status");
    };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const publish = ev.submitter?.value === "publish";
    run(async () => {
      await save();
      if (publish) {
        model = await api("/api/studio/mods/" + model.id + "/publish", {
          method: "POST",
          data: { revision: model.revision },
        });
        msg(el("save-status"), "Published. Your release is in the catalog.");
      } else msg(el("save-status"), "Draft saved.");
      syncInfo();
    });
  };
  renderMedia();
  syncInfo();
}
