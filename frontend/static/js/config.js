/* CampusFix — Configuration */

// Shared constants used across the app. Loaded first.
const THEME_KEY = "campusfix-theme";

// Anchors inside a page map to that page and scroll to the section.
const SECTION_PAGES = { "how": "home", "admin-analytics": "admin", "admin-complaints": "admin", "admin-top": "admin" };
// Pages that need a signed-in user with a specific role.
const PROTECTED_PAGES = { student: "student", admin: "admin" };
const ADMIN_PORTAL_PAGES = ["admin", "admin-login", "admin-register"];
