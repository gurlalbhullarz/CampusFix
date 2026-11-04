/* CampusFix — Complaint image thumbnails and full-size preview */

// ===================== COMPLAINT IMAGES =====================
function hasComplaintImage(c) {
    return !!(c && c.tracking_id && typeof c.image === "string" && /^[\w.-]+\.(png|jpe?g|webp)$/i.test(c.image.trim()));
}
function complaintImageUrl(c) {
    return hasComplaintImage(c) ? `/api/complaints/${encodeURIComponent(c.tracking_id)}/image` : null;
}
function noImageBox(text, wide) {
    const box = el("span", "thumb-none" + (wide ? " wide" : ""));
    box.append(icon("image"), document.createTextNode(text));
    return box;
}
function imageThumb(c, opts = {}) {
    const url = complaintImageUrl(c);
    const emptyText = opts.emptyText || "No image";
    if (!url) return noImageBox(emptyText, opts.wide);
    const btn = el("button", "thumb-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", "View image for complaint " + c.tracking_id);
    const img = document.createElement("img");
    img.loading = "lazy"; img.alt = "Photo for " + (c.title || c.tracking_id);
    img.addEventListener("error", () => btn.replaceWith(noImageBox("Image unavailable", opts.wide)), { once: true });
    img.src = url;
    btn.appendChild(img);
    btn.addEventListener("click", e => { e.stopPropagation(); openLightbox(url, c.tracking_id + (c.title ? " · " + c.title : "")); });
    return btn;
}
let lightboxReturnFocus = null;
function openLightbox(url, caption) {
    const box = document.getElementById("imageLightbox");
    const img = document.getElementById("lightboxImg");
    const err = document.getElementById("lightboxErr");
    lightboxReturnFocus = document.activeElement;
    err.style.display = "none"; img.style.display = "";
    img.onerror = () => { img.style.display = "none"; err.style.display = "block"; };
    img.src = url; img.alt = caption || "Complaint image";
    document.getElementById("lightboxCap").textContent = caption || "";
    box.classList.add("open"); box.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("lightboxClose").focus();
}
function closeLightbox() {
    const box = document.getElementById("imageLightbox");
    if (!box.classList.contains("open")) return false;
    box.classList.remove("open"); box.setAttribute("aria-hidden", "true");
    document.getElementById("lightboxImg").removeAttribute("src");
    document.body.style.overflow = "";
    if (lightboxReturnFocus && lightboxReturnFocus.focus) lightboxReturnFocus.focus();
    return true;
}
document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
document.getElementById("imageLightbox").addEventListener("click", e => { if (e.target.id === "imageLightbox") closeLightbox(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && closeLightbox()) e.stopImmediatePropagation(); }, true);
