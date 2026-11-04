/* CampusFix — Report form, tracking, QR location prefill */

// ===================== COMPLAINT FORM =====================
const reportingSelect = document.getElementById("reportingType");
document.querySelectorAll(".choice").forEach(choice => {
    choice.addEventListener("click", () => {
        document.querySelectorAll(".choice").forEach(c => c.classList.toggle("selected", c === choice));
        choice.querySelector("input").checked = true;
        reportingSelect.value = choice.dataset.value;
        updateConfidentialHint();
    });
});
function syncChoiceFromSelect() {
    document.querySelectorAll(".choice").forEach(c => {
        const on = c.dataset.value === reportingSelect.value;
        c.classList.toggle("selected", on);
        c.querySelector("input").checked = on;
    });
    updateConfidentialHint();
}
function updateConfidentialHint() {
    const hint = document.getElementById("confidentialHint");
    if (!hint) return;
    hint.style.display = reportingSelect.value === "false" && !currentUser ? "flex" : "none";
}

const titleInput = document.getElementById("complaintTitle");
const descInput = document.getElementById("complaintDescription");
function updateCounters() {
    document.getElementById("titleCount").textContent = `${titleInput.value.length} / 150`;
    document.getElementById("descCount").textContent = `${descInput.value.length} / 3000`;
}
titleInput.addEventListener("input", updateCounters);
descInput.addEventListener("input", updateCounters);

// Image preview
const imageInput = document.getElementById("complaintImage");
const dropzone = document.getElementById("dropzone");
let previewUrl = null;
function updatePreview() {
    const file = imageInput.files && imageInput.files[0];
    const preview = document.getElementById("imagePreview");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (!file) { preview.style.display = "none"; dropzone.style.display = "flex"; return; }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    const message = document.getElementById("complaintMessage");
    if (!allowed.includes(file.type)) {
        imageInput.value = "";
        showMessage(message, "Only PNG, JPG, JPEG and WEBP images are allowed.", true);
        return updatePreview();
    }
    if (file.size > 5 * 1024 * 1024) {
        imageInput.value = "";
        showMessage(message, "Image is larger than 5 MB. Please choose a smaller file.", true);
        return updatePreview();
    }
    hideMessage(message);
    previewUrl = URL.createObjectURL(file);
    document.getElementById("imagePreviewImg").src = previewUrl;
    document.getElementById("imagePreviewName").textContent = file.name;
    document.getElementById("imagePreviewSize").textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
    preview.style.display = "flex";
    dropzone.style.display = "none";
}
imageInput.addEventListener("change", updatePreview);
document.getElementById("imageRemove").addEventListener("click", () => { imageInput.value = ""; updatePreview(); });
["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", e => {
    if (e.dataTransfer.files.length) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        imageInput.files = dt.files;
        updatePreview();
    }
});

function resetReportForm() {
    const form = document.getElementById("complaintForm");
    form.reset();
    imageInput.value = "";
    updatePreview();
    updateCounters();
    syncChoiceFromSelect();
    hideMessage(document.getElementById("complaintMessage"));
    form.style.display = "block";
    document.getElementById("trackingResult").style.display = "none";
}

document.getElementById("complaintForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const form = this;
    const message = document.getElementById("complaintMessage");
    const result = document.getElementById("trackingResult");
    const button = form.querySelector('button[type="submit"]');

    if (!form.checkValidity()) {
        form.reportValidity();
        return showMessage(message, "Please complete all required fields.", true);
    }
    if (reportingSelect.value === "false" && !currentUser) {
        return showMessage(message, "Please log in to submit a confidential complaint, or choose Anonymous.", true);
    }

    setLoading(button, true);
    result.style.display = "none";
    hideMessage(message);
    try {
        const formData = new FormData(form);
        formData.delete("reporting_choice");
        const data = await apiJSON("/api/complaints", {
            method: "POST",
            body: formData
        });

        result.replaceChildren();
        const ic = el("div", "ico"); ic.appendChild(icon("check"));
        const heading = el("h3", "", "Complaint submitted successfully");
        const sub = el("p", "", data.is_anonymous
            ? "Your anonymous complaint has been received. This ID is the only way to track it."
            : "Your complaint is linked to your account and will appear on your dashboard.");
        const idBox = el("div", "big-id");
        const idText = el("div");
        idText.append(el("small", "", "Your tracking ID"), el("code", "", data.tracking_id));
        const copy = el("button", "btn alt small");
        copy.type = "button";
        copy.append(icon("copy"), document.createTextNode("Copy"));
        copy.addEventListener("click", () => copyText(data.tracking_id));
        idBox.append(idText, copy);
        const warn = el("p", "warn-note");
        warn.append(icon("alert"), document.createTextNode("Save this ID now — it won't be shown again."));
        const actions = el("div", "form-actions");
        actions.style.justifyContent = "center";
        const link = el("a", "btn primary", "Track complaint");
        link.href = "#track";
        link.addEventListener("click", (e) => { e.preventDefault(); goTrack(data.tracking_id); });
        const again = el("button", "btn alt", "Report another issue");
        again.type = "button";
        again.addEventListener("click", resetReportForm);
        actions.append(link, again);
        result.append(ic, heading, sub, idBox, warn, actions);

        form.reset();
        form.style.display = "none";
        result.style.display = "block";
        result.scrollIntoView({behavior: "smooth", block: "center"});
    } catch (error) {
        if (error.status === 401) await refreshSession();
        showMessage(message, error.message, true);
    } finally {
        setLoading(button, false);
    }
});

// Home category shortcuts
document.querySelectorAll("#homeCategories .category").forEach(btn => {
    btn.addEventListener("click", () => {
        resetReportForm();
        document.getElementById("complaintCategory").value = btn.dataset.category;
        window.location.hash = "report";
    });
});

// ===================== TRACKING =====================
let pendingAutoTrack = false;

function buildStepper(status) {
    const order = ["Pending", "In Progress", "Resolved"];
    const idx = order.indexOf(status);
    const wrap = el("div", "stepper");
    order.forEach((label, i) => {
        let cls = "step";
        if (i < idx || (status === "Resolved" && i === idx)) cls += " done";
        else if (i === idx) cls += " current";
        const step = el("div", cls);
        const dot = el("div", "dot");
        dot.appendChild(icon(i < idx || status === "Resolved" ? "check" : i === idx ? "loader" : "check"));
        step.append(dot, document.createTextNode(label));
        wrap.appendChild(step);
    });
    return wrap;
}

async function runTrack() {
    const trackingId = document.getElementById("trackingId").value.trim();
    const message = document.getElementById("trackMessage");
    const result = document.getElementById("trackResult");
    const details = document.getElementById("complaintDetails");
    const timeline = document.getElementById("complaintTimeline");
    const button = document.querySelector('#trackForm button[type="submit"]');

    if (!trackingId) return showMessage(message, "Please enter a tracking ID.", true);

    setLoading(button, true);
    result.style.display = "none";
    hideMessage(message);
    try {
        const data = await apiJSON(`/api/complaints/${encodeURIComponent(trackingId)}`);
        const complaint = data.complaint;
        const history = data.history || [];
        details.replaceChildren();
        timeline.replaceChildren();

        // Header
        const head = el("div", "detail-head");
        const left = el("div");
        left.append(idChip(complaint.tracking_id), el("h3", "", complaint.title || "Untitled complaint"));
        const right = el("div");
        right.style.display = "flex"; right.style.gap = "6px"; right.style.flexWrap = "wrap";
        right.append(statusBadge(complaint.status));
        if (complaint.is_anonymous === undefined || Number(complaint.is_anonymous) === 1) {
            if (complaint.user_id === undefined || complaint.user_id === null) right.append(el("span", "badge anon", "Anonymous"));
        }
        head.append(left, right);

        // Progress
        const progress = el("div", "progress-block");
        progress.appendChild(buildStepper(complaint.status));

        // Grid
        const grid = el("div", "detail-grid");
        [
            ["Category", complaint.category],
            ["Location", complaint.location],
            ["Priority", complaint.priority],
            ["Current status", complaint.status],
            ["Submitted on", formatDate(complaint.created_at, true)],
            ["Updates", String(history.length)]
        ].forEach(([label, value]) => {
            const cell = el("div");
            cell.append(el("small", "", label), el("span", "", value ?? "Not available"));
            grid.appendChild(cell);
        });

        details.append(head, progress, grid);

        if (complaint.description) {
            const desc = el("div", "detail-desc");
            desc.append(el("small", "", "Description"), el("p", "", complaint.description));
            details.appendChild(desc);
        }

        const photo = el("div", "detail-image");
        photo.append(el("small", "", "Submitted photo"), imageThumb(complaint, { wide: true, emptyText: "No photo was submitted with this complaint" }));
        details.appendChild(photo);

        if (!history.length) {
            timeline.appendChild(el("p", "", "No status updates available."));
        } else {
            history.forEach(update => {
                const item = el("div");
                const top = el("div", "tl-top");
                top.append(statusBadge(update.new_status || "Status update"), el("span", "tl-time", formatDate(update.updated_at, true)));
                const remark = el("p", "tl-remark", update.remarks || "No remarks");
                const by = el("p", "tl-by", (update.old_status ? `${update.old_status} → ${update.new_status} · ` : "") + "Updated by " + (update.updated_by_name || "System"));
                item.append(top, remark, by);
                timeline.appendChild(item);
            });
        }
        result.style.display = "block";
    } catch (error) {
        let text = error.message;
        if (error.status === 404) text = "No complaint found with that tracking ID. Check for typos and try again.";
        if (error.status === 401) text = "This is a confidential complaint. Please log in with the account that submitted it.";
        if (error.status === 403) text = "You don't have access to this confidential complaint.";
        showMessage(message, text, true);
    } finally {
        setLoading(button, false);
    }
}
document.getElementById("trackForm").addEventListener("submit", function(event) {
    event.preventDefault();
    runTrack();
});


// ===================== QR URL LOCATION PREFILL =====================
(function() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("location");
    const select = document.getElementById("location");
    if (value && select) {
        const option = [...select.options].find(o => o.value.toLowerCase() === value.toLowerCase());
        if (option) select.value = option.value;
    }
})();
