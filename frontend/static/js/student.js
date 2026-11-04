/* CampusFix — Student dashboard */

// ===================== STUDENT DASHBOARD =====================
async function loadStudentDashboard() {
    const message = document.getElementById("studentMessage");
    const tableBody = document.getElementById("studentComplaints");
    hideMessage(message);
    tableBody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading complaints…</td></tr>';
    try {
        const data = await apiJSON("/api/complaints/my");
        const complaints = data.complaints || [];
        document.getElementById("myTotal").textContent = complaints.length;
        document.getElementById("myPending").textContent = complaints.filter(c => c.status === "Pending").length;
        document.getElementById("myProgress").textContent = complaints.filter(c => c.status === "In Progress").length;
        document.getElementById("myResolved").textContent = complaints.filter(c => c.status === "Resolved").length;
        tableBody.replaceChildren();

        if (!complaints.length) {
            const action = el("a", "btn primary");
            action.href = "#report";
            action.append(icon("plus"), document.createTextNode("Report new issue"));
            action.addEventListener("click", () => { resetReportForm(); reportingSelect.value = "false"; syncChoiceFromSelect(); });
            tableBody.appendChild(emptyState(8, "inbox", "No complaints yet",
                "You haven't submitted any confidential complaints. Report an issue and it will show up here.", action));
        } else {
            complaints.forEach(complaint => {
                const row = tableBody.insertRow();
                row.insertCell().appendChild(idChip(complaint.tracking_id));
                row.insertCell().appendChild(imageThumb(complaint));
                const t = row.insertCell(); t.className = "title-cell"; t.textContent = complaint.title ?? "";
                row.insertCell().textContent = complaint.category ?? "";
                row.insertCell().textContent = complaint.location ?? "";
                row.insertCell().appendChild(statusBadge(complaint.status));
                row.insertCell().textContent = formatDate(complaint.created_at);
                const actionCell = row.insertCell();
                actionCell.style.textAlign = "right";
                const button = el("button", "btn alt small", "Track");
                button.type = "button";
                button.addEventListener("click", () => goTrack(complaint.tracking_id));
                actionCell.appendChild(button);
            });
        }
    } catch (error) {
        if (error.status === 401) { applyUser(null); window.location.hash = "login"; return; }
        showMessage(message, error.message, true);
        tableBody.replaceChildren(emptyState(8, "alert", "Could not load complaints", error.message));
    }
}
