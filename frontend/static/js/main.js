/* CampusFix — Shared helpers and home-page animation */

// ===================== SHARED HELPERS =====================
let currentUser = null;

async function apiJSON(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return data;
}

function showMessage(element, text, isError = false, isSuccess = false) {
    element.style.display = "flex";
    element.textContent = text;
    element.classList.toggle("error", !!isError);
    element.classList.toggle("success", !isError && !!isSuccess);
}
function hideMessage(element) { element.style.display = "none"; }

function setLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle("loading", loading);
}

function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "i");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function statusBadge(status) {
    const map = {"Pending": "pending", "In Progress": "progress", "Resolved": "resolved"};
    return el("span", "badge " + (map[status] || "prio"), status || "Unknown");
}
function priorityBadge(priority) {
    const extra = priority === "High" ? " prio-high" : priority === "Critical" ? " prio-critical" : "";
    return el("span", "badge prio" + extra, priority || "—");
}

function formatDate(value, withTime = false) {
    if (!value) return "—";
    // SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS"
    const d = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
    if (isNaN(d)) return value;
    const opts = withTime
        ? {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"}
        : {day: "numeric", month: "short", year: "numeric"};
    return d.toLocaleString(undefined, opts);
}

function toast(text) {
    const t = document.getElementById("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("Tracking ID copied"); }
    catch { toast("Copy failed — select and copy manually"); }
}

function idChip(trackingId) {
    const chip = el("span", "id-chip");
    chip.title = trackingId;
    chip.appendChild(el("span", "", trackingId));
    const btn = el("button", "copy-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", "Copy tracking ID");
    btn.appendChild(icon("copy"));
    btn.addEventListener("click", e => { e.stopPropagation(); copyText(trackingId); });
    chip.appendChild(btn);
    return chip;
}

function emptyState(colspan, iconName, title, text, action) {
    const row = document.createElement("tr");
    const cell = row.insertCell();
    cell.colSpan = colspan;
    cell.className = "empty-cell";
    const box = el("div", "empty");
    const ic = el("div", "ico"); ic.appendChild(icon(iconName));
    box.append(ic, el("h4", "", title), el("p", "", text));
    if (action) box.appendChild(action);
    cell.appendChild(box);
    return row;
}

function goTrack(trackingId) {
    document.getElementById("trackingId").value = trackingId;
    if (window.location.hash === "#track") runTrack();
    else { pendingAutoTrack = true; window.location.hash = "track"; }
}


// ===================== HERO MOCK: Pending → In Progress → Resolved =====================
(function() {
    const badge = document.getElementById("mockBadge");
    const steps = document.querySelectorAll("#mockStepper .step");
    const note = document.getElementById("mockNote");
    if (!badge || !steps.length) return;
    const states = [
        { status: "Pending", cls: "pending", title: "Report received", text: "Logged with a private tracking ID." },
        { status: "In Progress", cls: "progress", title: "Technician assigned", text: "Electrical team is inspecting the fan wiring." },
        { status: "Resolved", cls: "resolved", title: "Issue resolved", text: "Fan regulator replaced and tested." }
    ];
    let i = 1;
    function render() {
        const s = states[i];
        badge.className = "badge " + s.cls; badge.textContent = s.status;
        steps.forEach((step, n) => {
            const done = n < i || (i === 2 && n === 2);
            step.className = "step" + (done ? " done" : n === i ? " current" : "");
            step.querySelector("use").setAttribute("href", n === i && i !== 2 ? "#i-loader" : "#i-check");
        });
        note.querySelector("b").textContent = s.title;
        note.querySelector("div").lastChild.textContent = s.text;
    }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setInterval(() => { i = (i + 1) % states.length; render(); }, 2800);
    }
})();
