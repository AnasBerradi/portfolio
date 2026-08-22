const $ = (sel) => document.querySelector(sel);

const loginView = $("#login-view");
const dashView = $("#dash-view");

// videos in display order, kept for reordering
let currentVideos = [];

function show(view) {
  loginView.hidden = view !== "login";
  dashView.hidden = view !== "dash";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- session ----------
async function checkSession() {
  const res = await fetch("api/me");
  const { isAdmin } = await res.json();
  show(isAdmin ? "dash" : "login");
  if (isAdmin) loadList();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  const res = await fetch("api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: $("#password").value }),
  });
  if (res.ok) {
    $("#password").value = "";
    show("dash");
    loadList();
  } else {
    $("#login-error").textContent = "Wrong password — try again.";
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await fetch("api/logout", { method: "POST" });
  show("login");
});

// ---------- upload (file → backend → Cloudinary, then register) ----------
$("#upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#upload-btn");
  $("#upload-error").textContent = "";
  $("#upload-ok").textContent = "";

  const file = $("#video").files[0];
  if (!file) return;

  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const form = new FormData();
    form.append("video", file);
    const up = await fetch("api/upload", { method: "POST", body: form });
    const upData = await up.json();
    if (!up.ok) throw new Error(upData.error || "Upload failed");

    const res = await fetch("api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("#title").value,
        client: $("#client").value,
        tag: $("#tag").value,
        url: upData.url,
      }),
    });
    if (!res.ok) throw new Error("Could not register the video");

    $("#upload-ok").textContent = "Uploaded — it's live on your site.";
    e.target.reset();
    loadList();
  } catch (err) {
    $("#upload-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload video";
  }
});

// ---------- list ----------
async function loadList() {
  const res = await fetch("api/videos");
  currentVideos = await res.json();
  renderList();
}

function renderList() {
  const wrap = $("#admin-items");

  if (!currentVideos.length) {
    wrap.innerHTML = `<p style="color:var(--ink-dim);font-size:0.85rem">No videos yet — upload your first one above.</p>`;
    return;
  }

  wrap.innerHTML = currentVideos
    .map(
      (v, i) => `
      <div class="admin-item" data-id="${v.id}">
        <video src="${v.url}" muted preload="metadata"></video>
        <div class="admin-item-info">
          <div class="admin-item-title">${escapeHtml(v.title)}</div>
          <div class="admin-item-client">${escapeHtml(v.client || "—")}${v.tag ? ` · ${escapeHtml(v.tag)}` : ""}</div>
          <div class="admin-item-meta">${v.views || 0} view${v.views === 1 ? "" : "s"} · ${formatDate(v.created_at)}</div>
        </div>
        <div class="admin-item-actions">
          <button class="icon-btn" data-action="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-action="down" title="Move down" ${i === currentVideos.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-btn" data-action="edit">Edit</button>
          <button class="btn-danger" data-action="delete">Delete</button>
        </div>
      </div>`
    )
    .join("");
}

// one delegated listener for the whole list
$("#admin-items").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const item = btn.closest(".admin-item");
  const id = item.dataset.id;
  const action = btn.dataset.action;

  if (action === "delete") {
    if (!confirm("Remove this video from the site? (The file stays in your Cloudinary library.)")) return;
    await fetch(`api/videos/${id}`, { method: "DELETE" });
    loadList();
  }

  if (action === "edit") openEditor(item, id);
  if (action === "cancel-edit") loadList();
  if (action === "save-edit") saveEditor(item, id);

  if (action === "up" || action === "down") {
    const i = currentVideos.findIndex((v) => v.id === id);
    const j = action === "up" ? i - 1 : i + 1;
    [currentVideos[i], currentVideos[j]] = [currentVideos[j], currentVideos[i]];
    renderList();
    await fetch("api/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: currentVideos.map((v) => v.id) }),
    });
  }
});

// ---------- inline editor ----------
function openEditor(item, id) {
  const v = currentVideos.find((x) => x.id === id);
  item.querySelector(".admin-item-info").innerHTML = `
    <div class="admin-edit">
      <input type="text" id="edit-title" value="${escapeHtml(v.title)}" placeholder="Title" />
      <input type="text" id="edit-client" value="${escapeHtml(v.client || "")}" placeholder="Brand / client" />
      <input type="text" id="edit-tag" value="${escapeHtml(v.tag || "")}" placeholder="Tag" />
    </div>`;
  item.querySelector(".admin-item-actions").innerHTML = `
    <button class="icon-btn" data-action="save-edit">Save</button>
    <button class="icon-btn" data-action="cancel-edit">Cancel</button>`;
  item.querySelector("#edit-title").focus();
}

async function saveEditor(item, id) {
  await fetch(`api/videos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: item.querySelector("#edit-title").value,
      client: item.querySelector("#edit-client").value,
      tag: item.querySelector("#edit-tag").value,
    }),
  });
  loadList();
}

checkSession();
