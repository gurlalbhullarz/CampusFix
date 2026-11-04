/* CampusFix — Student & admin sign-in, registration, logout */

// ===================== ROLE-CHECKED LOGIN =====================
// Both portals use POST /api/auth/login. If the returned role doesn't match the
// portal, the session that was just created is closed again via /api/auth/logout.
async function loginForPortal(email, password, expectedRole) {
    const data = await apiJSON("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email, password })
    });
    const role = data.user && data.user.role;
    if (role !== expectedRole) {
        try { await apiJSON("/api/auth/logout", {method: "POST"}); } catch {}
        applyUser(null);
        const error = new Error(expectedRole === "student"
            ? "This is an administrator account. Please sign in through the Administrator Portal."
            : "Access denied. This account is not an administrator. Students should use the student login.");
        error.wrongRole = role;
        throw error;
    }
    return data;
}
function appendLink(element, href, text) {
    const a = el("a", "", text); a.href = href; element.appendChild(a);
}

// ===================== LOGIN =====================
document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const message = document.getElementById("loginMessage");
    const button = this.querySelector('button[type="submit"]');
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) return showMessage(message, "Please enter your email and password.", true);
    if (!document.getElementById("loginEmail").checkValidity()) return showMessage(message, "Please enter a valid email address.", true);

    hideMessage(message);
    setLoading(button, true);
    try {
        const data = await loginForPortal(email, password, "student");
        applyUser(data.user);
        this.reset();
        window.location.hash = "student";
    } catch (error) {
        showMessage(message, error.message, true);
        if (error.wrongRole === "admin") appendLink(message, "#admin-login", "Open Admin login →");
    } finally {
        setLoading(button, false);
    }
});

// ===================== REGISTRATION =====================
document.getElementById("registerForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const form = this;
    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById("registerMessage");
    const name = document.getElementById("registerName").value.trim();
    const emailInput = document.getElementById("registerEmail");
    const password = document.getElementById("registerPassword").value;

    if (!name || !emailInput.value.trim() || !password) return showMessage(message, "All fields are required.", true);
    if (!emailInput.checkValidity()) return showMessage(message, "Please enter a valid email address.", true);
    if (password.length < 8) return showMessage(message, "Password must contain at least 8 characters.", true);

    setLoading(button, true);
    hideMessage(message);
    try {
        const data = await apiJSON("/api/auth/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name, email: emailInput.value.trim(), password })
        });
        showMessage(message, (data.message || "Registration successful") + ". Redirecting to login…", false, true);
        form.reset();
        setTimeout(() => { window.location.hash = "login"; hideMessage(message); }, 1100);
    } catch (error) {
        showMessage(message, error.message, true);
    } finally {
        setLoading(button, false);
    }
});

// ===================== ADMIN LOGIN =====================
document.getElementById("adminLoginForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const message = document.getElementById("adminLoginMessage");
    const button = this.querySelector('button[type="submit"]');
    const emailInput = document.getElementById("adminLoginEmail");
    const email = emailInput.value.trim();
    const password = document.getElementById("adminLoginPassword").value;
    if (!email || !password) return showMessage(message, "Please enter your email and password.", true);
    if (!emailInput.checkValidity()) return showMessage(message, "Please enter a valid email address.", true);
    hideMessage(message);
    setLoading(button, true);
    try {
        const data = await loginForPortal(email, password, "admin");
        applyUser(data.user);
        this.reset();
        window.location.hash = "admin";
    } catch (error) {
        showMessage(message, error.message, true);
        if (error.wrongRole === "student") appendLink(message, "#login", "Go to student login →");
    } finally {
        setLoading(button, false);
    }
});

// ===================== ADMIN REGISTRATION =====================
// Sends exactly: name, email, password, invitation_code. The code is checked by
// the server only — nothing about invitation codes is stored in this file.
document.getElementById("adminRegisterForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    const form = this;
    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById("adminRegisterMessage");
    const name = document.getElementById("adminRegisterName").value.trim();
    const emailInput = document.getElementById("adminRegisterEmail");
    const password = document.getElementById("adminRegisterPassword").value;
    const confirm = document.getElementById("adminRegisterConfirm").value;
    const invitation_code = document.getElementById("adminInvitationCode").value.trim();

    if (!name || !emailInput.value.trim() || !password || !confirm || !invitation_code) return showMessage(message, "All fields are required, including your Admin Unique ID.", true);
    if (!emailInput.checkValidity()) return showMessage(message, "Please enter a valid email address.", true);
    if (password.length < 8) return showMessage(message, "Password must contain at least 8 characters.", true);
    if (password !== confirm) return showMessage(message, "Passwords don't match.", true);

    setLoading(button, true);
    hideMessage(message);
    try {
        const data = await apiJSON("/api/auth/admin/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name, email: emailInput.value.trim(), password, invitation_code })
        });
        form.reset();
        showMessage(message, (data.message || "Admin account created") + ". You can now sign in.", false, true);
        appendLink(message, "#admin-login", "Go to Admin login →");
    } catch (error) {
        let text = error.message;
        if (error.status === 404 || error.status === 405) text = "Admin registration isn't available on this server yet. Please contact the CampusFix project administrator.";
        showMessage(message, text, true);
    } finally {
        setLoading(button, false);
    }
});


// ===================== LOGOUT =====================
async function logoutCurrentUser() {
    try {
        await apiJSON("/api/auth/logout", {method: "POST"});
        applyUser(null);
        window.location.hash = "home";
        toast("You have been logged out");
    } catch (error) {
        alert("Logout failed: " + error.message);
    }
}

document.getElementById("studentLogout").addEventListener("click", logoutCurrentUser);
document.getElementById("navLogout").addEventListener("click", logoutCurrentUser);
document.getElementById("adminLogout").addEventListener("click", function(event) {
    event.preventDefault();
    logoutCurrentUser();
});
