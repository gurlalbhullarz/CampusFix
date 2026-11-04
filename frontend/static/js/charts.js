/* CampusFix — Admin Chart.js charts connected to live Flask analytics (GET /api/admin/dashboard) */

let statusChartInstance = null;
let categoryChartInstance = null;
let priorityChartInstance = null;
let monthlyChartInstance = null;
let lastDashboardData = null;
const chartBuilders = {};      // canvasId -> (scale) => Chart config, reused by the full-screen view
let expandedChart = null;
let expandedChartId = null;

const STATUS_LABELS = ["Pending", "In Progress", "Resolved"];
const PRIORITY_LABELS = ["Low", "Medium", "High", "Critical"];
const CATEGORY_LABELS = ["Electrical", "Plumbing", "Cleanliness", "Furniture", "Infrastructure", "Internet/Wi-Fi", "Other"];

function chartTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
        text: v("--muted", "#64748b"),
        grid: v("--line", "#e3e8ef"),
        surface: v("--surface", "#ffffff"),
        ink: v("--ink", "#0f1c2e"),
        tipBg: v("--toast-bg", "#0f1c2e"),
        tipInk: v("--toast-ink", "#ffffff"),
        amber: v("--amber", "#d97706"),
        blue: v("--blue", "#2457c5"),
        green: v("--green", "#16a34a"),
        red: v("--red", "#dc2626"),
        faint: v("--faint", "#94a3b8")
    };
}

// Hex/rgb -> rgba with alpha, for the line chart fill
function withAlpha(color, alpha) {
    const c = color.trim();
    if (c.startsWith("#")) {
        let h = c.slice(1);
        if (h.length === 3) h = h.split("").map(x => x + x).join("");
        const n = parseInt(h.slice(0, 6), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(",").slice(0, 3).join(","); return `rgba(${p}, ${alpha})`; }
    return c;
}

function destroyAdminCharts() {
    [statusChartInstance, categoryChartInstance, priorityChartInstance, monthlyChartInstance]
        .forEach(chart => { if (chart) chart.destroy(); });
    statusChartInstance = categoryChartInstance = priorityChartInstance = monthlyChartInstance = null;
}

// Guarantee label order and zero-count entries
function normalizeSeries(series, expectedLabels) {
    const labels = (series && series.labels) || [];
    const values = (series && series.values) || [];
    const map = new Map(labels.map((l, i) => [l, Number(values[i]) || 0]));
    if (!expectedLabels) return { labels: [...labels], values: labels.map(l => map.get(l)) };
    const extra = labels.filter(l => !expectedLabels.includes(l));
    const all = [...expectedLabels, ...extra];
    return { labels: all, values: all.map(l => map.get(l) || 0) };
}

const pct = (value, total) => total ? Math.round((value / total) * 1000) / 10 : 0;

// Draws the total in the centre of the doughnut
const centerTotalPlugin = {
    id: "centerTotal",
    afterDraw(chart, _args, opts) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;
        const { x, y } = meta.data[0];
        const total = chart.data.datasets[0].data.reduce((a, b) => a + (Number(b) || 0), 0);
        const ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = opts.ink;
        ctx.font = `700 ${26 * (opts.k || 1)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
        ctx.fillText(String(total), x, y - 8 * (opts.k || 1));
        ctx.fillStyle = opts.muted;
        ctx.font = `500 ${11 * (opts.k || 1)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
        ctx.fillText("Total complaints", x, y + 16 * (opts.k || 1));
        ctx.restore();
    }
};

// Writes the count at the end of each bar
const barValuePlugin = {
    id: "barValues",
    afterDatasetsDraw(chart, _args, opts) {
        const ctx = chart.ctx;
        const horizontal = chart.options.indexAxis === "y";
        ctx.save();
        ctx.fillStyle = opts.color;
        ctx.font = `600 ${opts.size || 12}px 'Plus Jakarta Sans', system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const value = chart.data.datasets[0].data[i];
            if (horizontal) { ctx.textAlign = "left"; ctx.fillText(String(value), bar.x + 8, bar.y); }
            else { ctx.textAlign = "center"; ctx.fillText(String(value), bar.x, bar.y - 12); }
        });
        ctx.restore();
    }
};

// Horizontal gradient fill for a bar, from a lighter tint into the full colour
function barGradient(color) {
    return ctx => {
        const { chart } = ctx;
        const area = chart.chartArea;
        if (!area) return color;
        const g = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
        g.addColorStop(0, withAlpha(color, 0.55));
        g.addColorStop(1, color);
        return g;
    };
}

// Vertical fade under the line chart
function areaGradient(color) {
    return ctx => {
        const area = ctx.chart.chartArea;
        if (!area) return withAlpha(color, 0.15);
        const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, withAlpha(color, 0.32));
        g.addColorStop(1, withAlpha(color, 0));
        return g;
    };
}

function axisScales(th, valueAxis) {
    const valueScale = { beginAtZero: true, grace: "12%", ticks: { precision: 0, color: th.text, padding: 6 }, grid: { color: th.grid, drawTicks: false }, border: { display: false, dash: [4, 4] } };
    const labelScale = { ticks: { color: th.ink, padding: 8, font: { weight: 500 } }, grid: { display: false }, border: { display: false } };
    return valueAxis === "x" ? { x: valueScale, y: labelScale } : { x: labelScale, y: valueScale };
}

// Create the chart once; afterwards update data/colours in place (no duplicates)
function upsertChart(instance, canvasId, buildConfig) {
    chartBuilders[canvasId] = buildConfig;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const config = buildConfig(1);
    if (instance && instance.canvas === canvas) {
        instance.data.labels = config.data.labels;
        config.data.datasets.forEach((ds, i) => {
            if (instance.data.datasets[i]) Object.assign(instance.data.datasets[i], ds);
            else instance.data.datasets[i] = ds;
        });
        instance.options = config.options;
        instance.update();
        return instance;
    }
    if (instance) instance.destroy();
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    return new Chart(canvas, config);
}

function updateAdminCharts(dashboardData) {
    if (typeof Chart === "undefined") {
        setAnalyticsState("error", "Chart.js could not load. Check your internet connection.");
        return;
    }
    if (!dashboardData || dashboardData.success === false) return;

    lastDashboardData = dashboardData;
    const th = chartTheme();

    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = th.text;
    Chart.defaults.borderColor = th.grid;
    Object.assign(Chart.defaults.plugins.tooltip, {
        backgroundColor: th.tipBg, titleColor: th.tipInk, bodyColor: th.tipInk, padding: 10, cornerRadius: 10
    });

    const stats = dashboardData.statistics || {};
    const statusData = normalizeSeries(dashboardData.status_chart || {
        labels: STATUS_LABELS, values: [stats.pending || 0, stats.in_progress || 0, stats.resolved || 0]
    }, STATUS_LABELS);
    const categoryData = normalizeSeries(dashboardData.category_chart, CATEGORY_LABELS);
    const priorityData = normalizeSeries(dashboardData.priority_chart, PRIORITY_LABELS);
    const monthlyData = normalizeSeries(dashboardData.monthly_chart);

    const statusColors = { "Pending": th.amber, "In Progress": th.blue, "Resolved": th.green };
    const priorityColors = { Low: th.faint, Medium: th.blue, High: th.amber, Critical: th.red };

    // 1. Status — doughnut with centre total and percentages
    statusChartInstance = upsertChart(statusChartInstance, "statusChart", (k = 1) => {
        const total = statusData.values.reduce((a, b) => a + b, 0);
        return {
            type: "doughnut",
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: statusData.labels.map(l => statusColors[l] || th.faint),
                    borderColor: th.surface,
                    borderWidth: 4,
                    borderRadius: 6,
                    spacing: 2,
                    hoverOffset: 8
                }]
            },
            plugins: [centerTotalPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "72%",
                layout: { padding: 8 * k },
                plugins: {
                    centerTotal: { ink: th.ink, muted: th.text, k },
                    legend: {
                        position: "bottom",
                        labels: {
                            usePointStyle: true, pointStyle: "circle", boxWidth: 8 * k, padding: 16 * k, color: th.text, font: { size: 12 * k },
                            generateLabels(chart) {
                                const base = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
                                const data = chart.data.datasets[0].data;
                                const sum = data.reduce((a, b) => a + (Number(b) || 0), 0);
                                return base.map((item, i) => ({ ...item, text: `${item.text} · ${pct(data[i], sum)}%`, fontColor: th.text }));
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const sum = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                                return ` ${ctx.label}: ${ctx.parsed} (${pct(ctx.parsed, sum)}%)`;
                            }
                        }
                    }
                }
            }
        };
    });

    // 2. Category — horizontal bars, zero categories included
    categoryChartInstance = upsertChart(categoryChartInstance, "categoryChart", (k = 1) => ({
        type: "bar",
        data: {
            labels: categoryData.labels,
            datasets: [{ label: "Complaints", data: categoryData.values, backgroundColor: barGradient(th.blue), borderRadius: 8, borderSkipped: false, barThickness: 14 * k, maxBarThickness: 28 }]
        },
        options: {
            indexAxis: "y", responsive: true, maintainAspectRatio: false,
            layout: { padding: { right: 24 } },
            scales: axisScales(th, "x"),
            plugins: { legend: { display: false }, barValues: { color: th.ink, size: 12 * k } }
        },
        plugins: [barValuePlugin]
    }));

    // 3. Monthly — smooth line over six months
    monthlyChartInstance = upsertChart(monthlyChartInstance, "monthlyChart", (k = 1) => ({
        type: "line",
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: "Complaints",
                data: monthlyData.values,
                borderColor: th.blue,
                backgroundColor: areaGradient(th.blue),
                fill: true,
                tension: 0.4,
                cubicInterpolationMode: "monotone",
                borderWidth: 3,
                pointRadius: 4 * k,
                pointHoverRadius: 7 * k,
                pointBorderWidth: 2,
                pointBackgroundColor: th.surface,
                pointBorderColor: th.blue
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: (() => {
                const sc = axisScales(th, "y");
                sc.x.ticks = { ...sc.x.ticks, maxRotation: 0, autoSkip: false,
                    callback(value) { const l = String(this.getLabelForValue(value)); const [m, y] = l.split(" "); return y ? [m, y] : m; } };
                return sc;
            })(),
            plugins: { legend: { display: false } }
        }
    }));

    // 4. Priority — bars coloured by urgency
    priorityChartInstance = upsertChart(priorityChartInstance, "priorityChart", (k = 1) => ({
        type: "bar",
        data: {
            labels: priorityData.labels,
            datasets: [{
                label: "Complaints",
                data: priorityData.values,
                backgroundColor: ctx => barGradient(priorityColors[priorityData.labels[ctx.dataIndex]] || th.faint)(ctx),
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 18 * k,
                maxBarThickness: 36
            }]
        },
        options: {
            indexAxis: "y", responsive: true, maintainAspectRatio: false,
            layout: { padding: { right: 24 } },
            scales: axisScales(th, "x"),
            plugins: { legend: { display: false }, barValues: { color: th.ink, size: 12 * k } }
        },
        plugins: [barValuePlugin]
    }));

    if (expandedChartId) renderExpandedChart();
}

// ===================== Loading / error states for the analytics grid =====================
function setAnalyticsState(state, message) {
    document.querySelectorAll("#admin-analytics .chart-box").forEach(box => {
        let overlay = box.querySelector(".chart-state");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "chart-state";
            box.appendChild(overlay);
        }
        overlay.replaceChildren();
        box.classList.toggle("is-loading", state === "loading");
        box.classList.toggle("is-error", state === "error");

        if (state === "loading") {
            const spinner = document.createElement("span");
            spinner.className = "chart-spinner";
            spinner.setAttribute("aria-hidden", "true");
            const label = document.createElement("small");
            label.textContent = "Loading analytics…";
            overlay.append(spinner, label);
            overlay.setAttribute("role", "status");
        } else if (state === "error") {
            const text = document.createElement("small");
            text.textContent = message || "Couldn't load analytics.";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "btn alt small";
            retry.textContent = "Retry";
            retry.addEventListener("click", () => { if (typeof loadAdminAnalytics === "function") loadAdminAnalytics(); });
            overlay.append(text, retry);
            overlay.setAttribute("role", "alert");
        } else {
            overlay.removeAttribute("role");
        }
    });
}

// ===================== Full-screen chart view =====================
function ensureChartModal() {
    let modal = document.getElementById("chartModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "chartModal";
    modal.className = "chart-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="chart-modal-panel">
            <div class="chart-modal-head">
                <div><h3 id="chartModalTitle"></h3><p id="chartModalSub"></p></div>
                <button type="button" class="chart-icon-btn" id="chartModalClose" aria-label="Close full-screen chart">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="chart-modal-body"><canvas id="chartModalCanvas"></canvas></div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeChartModal(); });
    modal.querySelector("#chartModalClose").addEventListener("click", closeChartModal);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && expandedChartId) closeChartModal(); });
    return modal;
}

function renderExpandedChart() {
    if (!expandedChartId || !chartBuilders[expandedChartId]) return;
    if (expandedChart) expandedChart.destroy();
    const config = chartBuilders[expandedChartId](1.5);
    const prevSize = Chart.defaults.font.size;
    Chart.defaults.font.size = 15;
    expandedChart = new Chart(document.getElementById("chartModalCanvas"), config);
    Chart.defaults.font.size = prevSize;
}

function openChartModal(canvasId) {
    if (!chartBuilders[canvasId]) return;
    const modal = ensureChartModal();
    const head = document.getElementById(canvasId).closest(".card").querySelector(".card-head");
    document.getElementById("chartModalTitle").textContent = head.querySelector("h3")?.textContent || "";
    document.getElementById("chartModalSub").textContent = head.querySelector("p")?.textContent || "";
    expandedChartId = canvasId;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderExpandedChart();
    document.getElementById("chartModalClose").focus();
}

function closeChartModal() {
    const modal = document.getElementById("chartModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (expandedChart) expandedChart.destroy();
    const lastId = expandedChartId;
    expandedChart = null; expandedChartId = null;
    document.querySelector(`[data-expand-chart="${lastId}"]`)?.focus();
}

// Add an expand button to every analytics card header (runs once)
(function addExpandButtons() {
    document.querySelectorAll("#admin-analytics .card").forEach(card => {
        const canvas = card.querySelector("canvas");
        const head = card.querySelector(".card-head");
        if (!canvas || !head || head.querySelector("[data-expand-chart]")) return;
        const text = document.createElement("div");
        text.className = "card-head-text";
        [...head.children].forEach(c => text.appendChild(c));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chart-icon-btn";
        btn.dataset.expandChart = canvas.id;
        btn.title = "Open full screen";
        btn.setAttribute("aria-label", "Open " + (text.querySelector("h3")?.textContent || "chart") + " full screen");
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
        btn.addEventListener("click", () => openChartModal(canvas.id));
        head.append(text, btn);
        card.classList.add("chart-card");
        card.querySelector(".chart-box")?.addEventListener("dblclick", () => openChartModal(canvas.id));
    });
})();
