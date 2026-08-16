// ─────────────────────────────────────────────────────────────
//  Cloudinary settings — filled in once the account exists.
// ─────────────────────────────────────────────────────────────
const CLOUD_NAME = "kx9kxkue";
const UPLOAD_PRESET = "portfolio";         // unsigned upload preset name

const $ = (sel) => document.querySelector(sel);

$("#upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#upload-btn");
  $("#upload-error").textContent = "";
  $("#upload-progress").textContent = "";

  if (CLOUD_NAME === "YOUR_CLOUD_NAME") {
    $("#upload-error").textContent = "Cloudinary isn't connected yet — ask Anas to finish the setup.";
    return;
  }

  const file = $("#video").files[0];
  if (!file) return;

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);

  btn.disabled = true;
  btn.textContent = "Uploading…";
  $("#upload-progress").textContent = "Sending to Cloudinary — large files can take a minute.";

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Upload failed");

    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const line =
      `{ title: "${esc($("#title").value.trim())}", ` +
      `client: "${esc($("#client").value.trim())}", ` +
      `tag: "${esc($("#tag").value.trim())}", ` +
      `file: "${data.secure_url}" },`;

    $("#snippet").value = line;
    $("#result").hidden = false;
    $("#upload-progress").textContent = "Uploaded. One step left:";
    e.target.reset();
  } catch (err) {
    $("#upload-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload video";
  }
});

$("#copy-btn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#snippet").value);
  $("#copy-ok").textContent = "Copied — paste it at the top of videos.js.";
});
