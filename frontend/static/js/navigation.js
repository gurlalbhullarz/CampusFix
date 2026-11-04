/* CampusFix — Session, menu and page routing */

// ===================== SESSION / NAV =====================
function applyUser(user) {
    currentUser = user;
    document.body.classList.toggle("signed-in", !!user);
    document.querySelectorAll(".nav-role-student").forEach(a => a.hidden = !(user && user.role === "student"));
    document.querySelectorAll(".nav-role-admin").forEach(a => a.hidden = !(user && user.role === "admin"));
    if (user) {
        document.getElementById("navUserName").textContent = user.name;
        document.getElementById("navAvatar").textContent = (user.name || "?").trim().charAt(0).toUpperCase();
        document.getElementById("studentWelcome").textContent = "Welcome back, " + (user.name || "").split(" ")[0];
        document.getElementById("adminName").textContent = user.name;
        document.getElementById("adminTopName").textContent = user.name;
        document.getElementById("adminAvatar").textContent = (user.name || "A").trim().charAt(0).toUpperCase();
    }
    updateConfidentialHint();
}

async function refreshSession() {
    try {
        const data = await apiJSON("/api/auth/me");
        applyUser(data.user);
    } catch {
        applyUser(null);
    }
}

document.getElementById("menuToggle").addEventListener("click", function() {
    const open = document.body.classList.toggle("menu-open");
    this.setAttribute("aria-expanded", open);
});

// Password visibility toggles
document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    });
});


// ===================== HASH ROUTING =====================
// Anchors inside a page map to that page and scroll to the section.


// Pages that need a signed-in user with a specific role.



async function showPage() {
    const hash = window.location.hash.slice(1) || "home";
    const id = SECTION_PAGES[hash] || hash;

    // Role guard: re-check the server session before showing a protected portal.
    // The server still enforces access on every API call; this only keeps the UI honest.
    const requiredRole = PROTECTED_PAGES[id];
    if (requiredRole) {
        await refreshSession();
        if (!currentUser) {
            toast("Please sign in to continue");
            window.location.replace("#" + (requiredRole === "admin" ? "admin-login" : "login"));
            return;
        }
        if (currentUser.role !== requiredRole) {
            toast(requiredRole === "admin" ? "Access denied: administrators only" : "That page is for student accounts");
            if (currentUser.role === "student" && requiredRole === "admin") {
                window.location.replace("#login");
                setTimeout(() => showMessage(document.getElementById("loginMessage"), "Access denied: the admin portal is for administrators only. You are signed in as a student — open your Student Dashboard instead.", true), 50);
            } else {
                window.location.replace("#" + (currentUser.role === "admin" ? "admin" : "student"));
            }
            return;
        }
    }
    document.querySelectorAll(".page").forEach(page => page.style.display = "none");
    const target = document.getElementById(id);
    const pageId = target && target.classList.contains("page") ? id : "home";
    document.getElementById(pageId).style.display = "block";

    document.body.classList.remove("menu-open");
    document.body.classList.toggle("admin-view", ADMIN_PORTAL_PAGES.includes(pageId));
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === hash || (hash === "home" && a.dataset.nav === "home")));
    document.querySelectorAll("[data-admin-link]").forEach(a => {
        const key = hash === "admin" ? "top" : hash.replace("admin-", "");
        a.classList.toggle("active", a.dataset.adminLink === key);
    });

    if (SECTION_PAGES[hash]) {
        requestAnimationFrame(() => document.getElementById(hash).scrollIntoView({behavior: "smooth"}));
    } else {
        window.scrollTo({top: 0});
    }

    if (pageId !== "admin" && currentEditingTrackingId) closeAdminEditor();
    if (pageId === "student") loadStudentDashboard();
    if (pageId === "admin" && hash === "admin") loadAdminDashboard();
    if (pageId === "admin" && hash !== "admin" && !adminComplaintCache.length) loadAdminDashboard();
    if (pageId === "report") {
        if (document.getElementById("complaintForm").style.display === "none") resetReportForm();
        updateCounters(); syncChoiceFromSelect();
    }
    if (pageId === "track" && pendingAutoTrack) { pendingAutoTrack = false; runTrack(); }
}
window.addEventListener("hashchange", showPage);
// Start once every script file has loaded.
document.addEventListener("DOMContentLoaded", () => { refreshSession().finally(showPage); });
