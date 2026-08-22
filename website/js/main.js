// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- video grid ----------
async function loadVideos() {
  const grid = $("#video-grid");
  const empty = $("#empty-state");

  let videos = [];
  try {
    const res = await fetch("api/videos");
    videos = await res.json();
  } catch {
    // leave grid empty
  }

  if (!videos.length) {
    empty.hidden = false;
    return;
  }

  grid.innerHTML = videos
    .map(
      (v, i) => `
      <article class="card" data-index="${i}" tabindex="0" role="button"
               aria-label="Play ${escapeHtml(v.title)}">
        <video src="${v.url}" muted loop playsinline preload="metadata"></video>
        ${v.tag ? `<span class="card-tag">${escapeHtml(v.tag)}</span>` : ""}
        <div class="card-overlay">
          <h3 class="card-title">${escapeHtml(v.title)}</h3>
          ${v.client ? `<p class="card-client">${escapeHtml(v.client)}</p>` : ""}
        </div>
        <div class="card-play">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </article>`
    )
    .join("");

  grid.querySelectorAll(".card").forEach((card) => {
    const video = card.querySelector("video");
    const data = videos[Number(card.dataset.index)];

    // hover = muted preview
    card.addEventListener("mouseenter", () => video.play().catch(() => {}));
    card.addEventListener("mouseleave", () => {
      video.pause();
      video.currentTime = 0;
    });

    // click = fullscreen with sound
    card.addEventListener("click", () => openPlayer(data));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPlayer(data);
      }
    });
  });

  observeCards();
}

// staggered card entrance
function observeCards() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add("is-visible"), (i % 4) * 90);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".card").forEach((c) => io.observe(c));
}

// ---------- fullscreen player ----------
const player = $("#player");
const playerVideo = $("#player-video");

function openPlayer(video) {
  fetch(`api/videos/${video.id}/view`, { method: "POST" }).catch(() => {});
  playerVideo.src = video.url;
  $("#player-title").textContent = video.title;
  $("#player-client").textContent = video.client || "";
  player.hidden = false;
  document.body.style.overflow = "hidden";
  playerVideo.play().catch(() => {});
}

function closePlayer() {
  playerVideo.pause();
  playerVideo.removeAttribute("src");
  playerVideo.load();
  player.hidden = true;
  document.body.style.overflow = "";
}

$("#player-close").addEventListener("click", closePlayer);
player.addEventListener("click", (e) => {
  if (e.target === player) closePlayer();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !player.hidden) closePlayer();
});

// ---------- stat counters ----------
function animateCounters() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        const suffix = el.dataset.suffix || "+";
        const duration = 1200;
        const start = performance.now();
        (function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + (p === 1 ? suffix : "");
          if (p < 1) requestAnimationFrame(tick);
        })(start);
        io.unobserve(el);
      });
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll(".stat-num").forEach((el) => io.observe(el));
}

// ---------- init ----------
$("#year").textContent = new Date().getFullYear();
loadVideos();
animateCounters();
