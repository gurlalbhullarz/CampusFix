/* CampusFix — Light / dark theme */

// ===================== THEME (light / dark) =====================

function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
function syncThemeControls() {
    const dark = currentTheme() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(b => {
        b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
        b.setAttribute("aria-pressed", String(dark));
    });
    document.querySelectorAll("[data-theme-label]").forEach(l => l.textContent = dark ? "Light mode" : "Dark mode");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a0d14" : "#f6f8fb");
}
function setTheme(theme, persist = true) {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.setAttribute("data-theme", theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch {} }
    syncThemeControls();
    if (typeof lastDashboardData !== "undefined" && lastDashboardData) updateAdminCharts(lastDashboardData);
    clearTimeout(setTheme._t);
    setTheme._t = setTimeout(() => root.classList.remove("theme-anim"), 400);
}
document.querySelectorAll("[data-theme-toggle]").forEach(b => b.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark")));
// Follow the device setting live, but only while the user hasn't chosen.
if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", e => {
        let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch {}
        if (!saved) setTheme(e.matches ? "dark" : "light", false);
    });
}
syncThemeControls();

// Floating nav gets a deeper shadow once the page scrolls
window.addEventListener("scroll", () => document.querySelector("header.site").classList.toggle("scrolled", window.scrollY > 8), {passive: true});
