/**
 * charts.js — Chart.js Wrappers & Analytics Rendering
 * All chart instances are stored to allow clean destroy/re-render.
 */

const Charts = (() => {
  const instances = {};

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgba(255,255,255,0.75)',
          font: { family: 'Inter', size: 12 },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(13,17,27,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: 'rgba(255,255,255,0.75)',
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => ` ₹${Number(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    }
  };

  const EXPENSE_COLORS = [
    '#f97316','#06b6d4','#ec4899','#eab308','#ef4444',
    '#8b5cf6','#a78bfa','#14b8a6','#f472b6','#6b7280',
    '#fb923c','#22d3ee','#f43f5e','#fbbf24','#c084fc'
  ];

  const INCOME_COLOR  = 'rgba(34, 197, 94, 0.85)';
  const EXPENSE_COLOR = 'rgba(239, 68, 68, 0.85)';
  const INCOME_BORDER  = 'rgba(34, 197, 94, 1)';
  const EXPENSE_BORDER = 'rgba(239, 68, 68, 1)';

  function destroyChart(key) {
    if (instances[key]) { instances[key].destroy(); delete instances[key]; }
  }

  function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    return el.getContext('2d');
  }

  // ─── Dashboard Doughnut ──────────────────────────────────────────────────────
  function renderDashboardDoughnut(canvasId, catBreakdown, categories) {
    destroyChart('dashDoughnut');
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const entries = Object.entries(catBreakdown).filter(([,v]) => v > 0);
    if (!entries.length) {
      renderEmpty(ctx, canvasId, 'No expenses yet');
      return;
    }

    const labels = entries.map(([id]) => {
      const c = categories.find(x => x.id === id);
      return c ? c.name : id;
    });
    const data   = entries.map(([,v]) => v);
    const colors = entries.map(([id], i) => {
      const c = categories.find(x => x.id === id);
      return c ? c.color : EXPENSE_COLORS[i % EXPENSE_COLORS.length];
    });

    instances['dashDoughnut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '68%',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' }
        }
      }
    });
  }

  // ─── Monthly Bar Chart (income vs expense) ───────────────────────────────────
  function renderMonthlyBar(canvasId, txs) {
    destroyChart('monthlyBar');
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    // Group by day
    const dayMap = {};
    txs.forEach(t => {
      const day = t.date.slice(8, 10);
      if (!dayMap[day]) dayMap[day] = { income: 0, expense: 0 };
      dayMap[day][t.type] += t.amount;
    });

    const days = Object.keys(dayMap).sort();
    const incomeData  = days.map(d => dayMap[d].income);
    const expenseData = days.map(d => dayMap[d].expense);

    instances['monthlyBar'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days.map(d => +d),
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: INCOME_COLOR,
            borderColor: INCOME_BORDER,
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Expense',
            data: expenseData,
            backgroundColor: EXPENSE_COLOR,
            borderColor: EXPENSE_BORDER,
            borderWidth: 1.5,
            borderRadius: 6,
          }
        ]
      },
      options: {
        ...CHART_DEFAULTS,
        scales: buildScales(),
      }
    });
  }

  // ─── Day-by-day Line Chart ───────────────────────────────────────────────────
  function renderDailyLine(canvasId, dailySummary) {
    destroyChart('dailyLine');
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const entries = Object.entries(dailySummary).sort(([a],[b]) => a.localeCompare(b));
    const labels  = entries.map(([k]) => +k.slice(8));
    const expData = entries.map(([,v]) => v.expense);
    const incData = entries.map(([,v]) => v.income);

    instances['dailyLine'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Expense',
            data: expData,
            borderColor: EXPENSE_BORDER,
            backgroundColor: 'rgba(239,68,68,0.12)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
          },
          {
            label: 'Income',
            data: incData,
            borderColor: INCOME_BORDER,
            backgroundColor: 'rgba(34,197,94,0.12)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
          }
        ]
      },
      options: {
        ...CHART_DEFAULTS,
        scales: buildScales(),
      }
    });
  }

  // ─── 6-Month Trend Chart ─────────────────────────────────────────────────────
  function render6MonthTrend(canvasId, data6m) {
    destroyChart('trendLine');
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    instances['trendLine'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data6m.map(d => d.label),
        datasets: [
          {
            label: 'Income',
            data: data6m.map(d => d.income),
            borderColor: INCOME_BORDER,
            backgroundColor: 'rgba(34,197,94,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 8,
            borderWidth: 2.5,
          },
          {
            label: 'Expenses',
            data: data6m.map(d => d.expense),
            borderColor: EXPENSE_BORDER,
            backgroundColor: 'rgba(239,68,68,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 8,
            borderWidth: 2.5,
          }
        ]
      },
      options: {
        ...CHART_DEFAULTS,
        scales: buildScales(),
      }
    });
  }

  // ─── Category Breakdown Doughnut (Reports page) ──────────────────────────────
  function renderReportDoughnut(canvasId, catBreakdown, categories) {
    destroyChart('reportDoughnut');
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const entries = Object.entries(catBreakdown).filter(([,v]) => v > 0);
    if (!entries.length) {
      renderEmpty(ctx, canvasId, 'No data for this month');
      return;
    }

    const labels = entries.map(([id]) => (categories.find(x => x.id === id) || {}).name || id);
    const data   = entries.map(([,v]) => v);
    const colors = entries.map(([id], i) => {
      const c = categories.find(x => x.id === id);
      return c ? c.color : EXPENSE_COLORS[i % EXPENSE_COLORS.length];
    });

    instances['reportDoughnut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '65%',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' }
        }
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function buildScales() {
    const gridColor = 'rgba(255,255,255,0.06)';
    const tickColor = 'rgba(255,255,255,0.5)';
    const axisStyle = {
      grid: { color: gridColor },
      ticks: {
        color: tickColor,
        font: { family: 'Inter', size: 11 },
        callback: (v) => '₹' + Number(v).toLocaleString('en-IN'),
      }
    };
    return {
      x: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { family: 'Inter', size: 11 } }
      },
      y: axisStyle
    };
  }

  function renderEmpty(ctx, canvasId, msg) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.style.display = 'none';
    let empty = parent.querySelector('.chart-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'chart-empty';
      parent.appendChild(empty);
    }
    empty.textContent = msg;
    empty.style.display = 'flex';
  }

  return {
    renderDashboardDoughnut,
    renderMonthlyBar,
    renderDailyLine,
    render6MonthTrend,
    renderReportDoughnut,
    destroyAll() { Object.keys(instances).forEach(k => destroyChart(k)); }
  };
})();
