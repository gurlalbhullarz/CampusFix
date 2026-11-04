/* CampusFix — Admin dashboard and complaint management */

// ===================== ADMIN DASHBOARD + CHART.JS =====================
let adminComplaintCache = [];
let currentEditingTrackingId = null;

function setStatCards(stats) {
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value ?? 0; };
    set("adminTotal", stats.total);
    set("adminPending", stats.pending);
    set("adminProgress", stats.in_progress);
    set("adminResolved", stats.resolved);
}

async function handleAdminAuthError(error) {
    if (error.status === 401 || error.status === 403) {
        await refreshSession();
        toast("Admin access required");
        window.location.hash = "admin-login";
        return true;
    }
    return false;
}

// Live analytics: stat cards + four charts from GET /api/admin/dashboard
let analyticsRequestId = 0;
async function loadAdminAnalytics() {
    const requestId = ++analyticsRequestId;
    setAnalyticsState("loading");
    try {
        const data = await apiJSON("/api/admin/dashboard");
        if (requestId !== analyticsRequestId) return; // a newer request superseded this one
        if (!data || data.success === false) throw new Error((data && (data.message || data.error)) || "Analytics unavailable.");
        setStatCards(data.statistics || {});
        setAnalyticsState("ready");
        updateAdminCharts(data);
    } catch (error) {
        if (requestId !== analyticsRequestId) return;
        if (await handleAdminAuthError(error)) return;
        setAnalyticsState("error", error.message || "Couldn't load analytics.");
    }
}

async function loadAdminComplaints() {
    const message = document.getElementById("adminMessage");
    const tableBody = document.getElementById("adminComplaints");
    try {
        const complaintsData = await apiJSON("/api/admin/complaints");
        adminComplaintCache = complaintsData.complaints || [];
        renderAdminComplaints();
    } catch (error) {
        if (await handleAdminAuthError(error)) return;
        showMessage(message, error.message, true);
        tableBody.replaceChildren(emptyState(9, "alert", "Unable to load admin data", error.message));
    }
}

async function loadAdminDashboard() {
    const message = document.getElementById("adminMessage");
    const refresh = document.getElementById("adminRefresh");
    hideMessage(message);
    setLoading(refresh, true);
    try {
        await Promise.all([loadAdminAnalytics(), loadAdminComplaints()]);
    } finally {
        setLoading(refresh, false);
    }
}

function renderAdminComplaints() {
    const tableBody = document.getElementById("adminComplaints");
    const search = document.getElementById("adminSearch").value.trim().toLowerCase();
    const statusFilter = document.getElementById("adminStatusFilter").value;
    const categoryFilter = document.getElementById("adminCategoryFilter").value;
    const priorityFilter = document.getElementById("adminPriorityFilter").value;
    const filtered = adminComplaintCache.filter(c => {
        const searchable = [c.tracking_id, c.title, c.student_name, c.student_email]
            .filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(search)
            && (!statusFilter || c.status === statusFilter)
            && (!categoryFilter || c.category === categoryFilter)
            && (!priorityFilter || c.priority === priorityFilter);
    });
    tableBody.replaceChildren();
    document.getElementById("adminCount").textContent = `${filtered.length} of ${adminComplaintCache.length}`;

    if (!filtered.length) {
        tableBody.appendChild(adminComplaintCache.length
            ? emptyState(9, "search", "No matching complaints", "Try a different search term or clear the filters.")
            : emptyState(9, "inbox", "No complaints yet", "New reports from students will appear here."));
        return;
    }

    filtered.forEach(complaint => {
        const row = tableBody.insertRow();
        row.insertCell().appendChild(idChip(complaint.tracking_id));
        row.insertCell().appendChild(imageThumb(complaint));
        const t = row.insertCell(); t.className = "title-cell"; t.textContent = complaint.title ?? "";
        const sm = el("small", "", formatDate(complaint.created_at)); t.appendChild(sm);
        row.insertCell().textContent = complaint.category ?? "Not available";
        row.insertCell().textContent = complaint.location ?? "Not available";
        const studentCell = row.insertCell();
        if (complaint.student_name) studentCell.textContent = complaint.student_name;
        else studentCell.appendChild(el("span", "badge anon", "Anonymous"));
        row.insertCell().appendChild(priorityBadge(complaint.priority));
        row.insertCell().appendChild(statusBadge(complaint.status));
        const actionCell = row.insertCell();
        actionCell.style.textAlign = "right";
        const button = el("button", "btn alt small", "Manage");
        button.type = "button";
        button.addEventListener("click", () => openAdminEditor(complaint));
        actionCell.appendChild(button);
    });
}

function openAdminEditor(complaint) {
    currentEditingTrackingId = complaint.tracking_id;
    document.getElementById("editingTrackingId").textContent = "Tracking ID: " + complaint.tracking_id;
    document.getElementById("editStatus").value = complaint.status || "Pending";
    document.getElementById("editPriority").value = complaint.priority || "Medium";
    document.getElementById("editRemarks").value = "";

    const summary = document.getElementById("editSummary");
    summary.replaceChildren();
    const row = el("div", "row");
    row.append(statusBadge(complaint.status), priorityBadge(complaint.priority), el("span", "badge prio", complaint.category || ""));
    summary.append(el("strong", "", complaint.title || ""), el("p", "", `${complaint.location || ""} · ${complaint.student_name || "Anonymous"} · ${formatDate(complaint.created_at, true)}`), row);
    if (complaint.description) summary.appendChild(el("p", "", complaint.description));
    const imgWrap = el("div", "drawer-image");
    imgWrap.append(el("small", "", "Submitted photo"), imageThumb(complaint, { wide: true, emptyText: "No image was uploaded with this complaint" }));
    summary.appendChild(imgWrap);

    const panel = document.getElementById("adminEditPanel");
    panel.style.display = "flex";
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    document.getElementById("drawerBackdrop").classList.add("open");
    document.getElementById("adminEditMessage").style.display = "none";
    setTimeout(() => document.getElementById("editStatus").focus(), 200);
}

function closeAdminEditor() {
    const panel = document.getElementById("adminEditPanel");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    document.getElementById("drawerBackdrop").classList.remove("open");
    currentEditingTrackingId = null;
}

document.getElementById("saveAdminChanges").addEventListener("click", async function() {
    if (!currentEditingTrackingId) return;
    const button = this;
    const editMessage = document.getElementById("adminEditMessage");
    setLoading(button, true);
    hideMessage(editMessage);
    try {
        const selected = adminComplaintCache.find(c => c.tracking_id === currentEditingTrackingId);
        const newStatus = document.getElementById("editStatus").value;
        const newPriority = document.getElementById("editPriority").value;
        const remarks = document.getElementById("editRemarks").value.trim();

        if (!selected) throw new Error("Selected complaint was not found.");
        if (newStatus === selected.status && newPriority === selected.priority) {
            throw new Error(remarks
                ? "Remarks are saved together with a status change. Choose a new status to add this update."
                : "No changes to save.");
        }

        if (newStatus !== selected.status) {
            await apiJSON(`/api/complaints/${encodeURIComponent(currentEditingTrackingId)}/status`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({status: newStatus, remarks})
            });
        }

        if (newPriority !== selected.priority) {
            await apiJSON(`/api/admin/complaints/${encodeURIComponent(currentEditingTrackingId)}/priority`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({priority: newPriority})
            });
        }

        closeAdminEditor();
        toast("Complaint updated successfully");
        await loadAdminDashboard();
    } catch (error) {
        showMessage(editMessage, error.message, true);
    } finally {
        setLoading(button, false);
    }
});

document.getElementById("cancelAdminEdit").addEventListener("click", closeAdminEditor);
document.getElementById("drawerClose").addEventListener("click", closeAdminEditor);
document.getElementById("drawerBackdrop").addEventListener("click", closeAdminEditor);
document.addEventListener("keydown", e => { if (e.key === "Escape" && currentEditingTrackingId) closeAdminEditor(); });
document.getElementById("adminSearch").addEventListener("input", renderAdminComplaints);
document.getElementById("adminStatusFilter").addEventListener("change", renderAdminComplaints);
document.getElementById("adminCategoryFilter").addEventListener("change", renderAdminComplaints);
document.getElementById("adminPriorityFilter").addEventListener("change", renderAdminComplaints);
document.getElementById("adminRefresh").addEventListener("click", loadAdminDashboard);
