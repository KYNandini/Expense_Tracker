/**
 * app.js — Main Application Controller
 * Handles routing, page rendering, modals, and all UI interactions.
 */

/* ═══════════════════════════════════════════════════════════
   GLOBALS & STATE
   ═══════════════════════════════════════════════════════════ */
let currentUser = null;
let currentPage = 'dashboard';
let reportMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
let txFilter = 'all';
let txSearch = '';
let editingTxId = null;
let editingCatId = null;

const fmt = (n) => '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
};
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/* ═══════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: '💡' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, duration);
}

/* ═══════════════════════════════════════════════════════════
   AUTH FLOW
   ═══════════════════════════════════════════════════════════ */
function initAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`${target}-form`).classList.remove('hidden');
      document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    const btn = e.target.querySelector('button[type="submit"]');
    const ogText = btn.textContent;
    btn.textContent = 'Syncing...';
    btn.disabled = true;

    const result = await Auth.login({ username, password });

    btn.textContent = ogText;
    btn.disabled = false;

    if (result.success) {
      showApp(result.user);
    } else {
      document.getElementById('login-error').textContent = result.error;
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name     = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const result = Auth.register({ name, username, password });
    if (result.success) {
      showApp(result.user);
    } else {
      document.getElementById('register-error').textContent = result.error;
    }
  });
}

function showApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  const app = document.getElementById('main-app');
  app.classList.add('visible');
  document.getElementById('header-name').textContent = user.name.split(' ')[0];
  if (DB.listenToCloud) DB.listenToCloud(user.id);
  navigateTo('dashboard');
}

function showAuth() {
  currentUser = null;
  if (DB.stopListen) DB.stopListen();
  document.getElementById('auth-screen').style.display = '';
  document.getElementById('main-app').classList.remove('visible');
  Charts.destroyAll();
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════ */
function navigateTo(page) {
  currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Show page
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  // Render
  const renderers = {
    dashboard:    renderDashboard,
    transactions: renderTransactions,
    categories:   renderCategories,
    reports:      renderReports,
    analytics:    renderAnalytics,
  };
  if (renderers[page]) renderers[page]();
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function renderDashboard() {
  const uid = currentUser.id;
  const now = new Date();
  const thisMonthTxs = DB.Transactions.getByMonth(uid, now.getFullYear(), now.getMonth() + 1);
  const allTxs = DB.Transactions.getAll(uid);

  const income  = DB.Transactions.sumByType(thisMonthTxs, 'income');
  const expense = DB.Transactions.sumByType(thisMonthTxs, 'expense');
  const balance = DB.Transactions.sumByType(allTxs, 'income') - DB.Transactions.sumByType(allTxs, 'expense');

  // Balance card
  document.getElementById('dash-balance').textContent = fmt(balance);
  document.getElementById('dash-balance-month').textContent = monthLabel(now.getFullYear(), now.getMonth() + 1);
  document.getElementById('dash-income').textContent  = fmtShort(income);
  document.getElementById('dash-expense').textContent = fmtShort(expense);

  // Recent transactions
  const recent = allTxs.slice(0, 5);
  const cats = DB.Categories.getAll(uid);
  document.getElementById('dash-recent').innerHTML = recent.length
    ? recent.map(t => txItemHTML(t, cats)).join('')
    : emptyStateHTML('📋', 'No transactions yet', 'Add your first transaction using the + button.');

  // Doughnut chart
  const expenseTxs = thisMonthTxs.filter(t => t.type === 'expense');
  const catBreakdown = DB.Transactions.sumByCategory(expenseTxs);
  Charts.renderDashboardDoughnut('dash-chart', catBreakdown, cats);
}

/* ═══════════════════════════════════════════════════════════
   TRANSACTIONS
   ═══════════════════════════════════════════════════════════ */
function renderTransactions() {
  const uid = currentUser.id;
  let txs = DB.Transactions.getAll(uid);
  const cats = DB.Categories.getAll(uid);

  // Filter by type
  if (txFilter !== 'all') txs = txs.filter(t => t.type === txFilter);

  // Search
  if (txSearch.trim()) {
    const q = txSearch.toLowerCase();
    txs = txs.filter(t => {
      const cat = cats.find(c => c.id === t.categoryId);
      return (
        t.description.toLowerCase().includes(q) ||
        (cat && cat.name.toLowerCase().includes(q)) ||
        t.amount.toString().includes(q)
      );
    });
  }

  document.getElementById('tx-list-container').innerHTML = txs.length
    ? txs.map(t => txItemHTML(t, cats, true)).join('')
    : emptyStateHTML('🔍', 'No transactions found', 'Try a different filter or add a new one.');
}

function txItemHTML(tx, cats, clickable = false) {
  const cat = cats.find(c => c.id === tx.categoryId) || { name: 'Unknown', icon: '📦', color: '#6b7280' };
  const sign = tx.type === 'income' ? '+' : '-';
  const cls  = tx.type;
  return `
    <div class="tx-item" ${clickable ? `onclick="openEditTx('${tx.id}')"` : ''} data-id="${tx.id}">
      <div class="tx-icon" style="background:${cat.color}22;">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-description">${tx.description || cat.name}</div>
        <div class="tx-meta">${cat.name} &bull; ${fmtDate(tx.date)}</div>
      </div>
      <div class="tx-amount ${cls}">${sign}${fmt(tx.amount)}</div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   CATEGORIES
   ═══════════════════════════════════════════════════════════ */
function renderCategories() {
  const uid = currentUser.id;
  const cats = DB.Categories.getAll(uid);
  const expense = cats.filter(c => c.type === 'expense');
  const income  = cats.filter(c => c.type === 'income');

  const renderCatGrid = (list) => list.map(c => `
    <div class="category-item" style="border-color:${c.color}33;">
      <div style="font-size:28px;">${c.icon}</div>
      <div class="cat-name">${c.name}</div>
      <span class="cat-type-badge ${c.type}">${c.type}</span>
      ${c.custom ? `<div class="cat-actions">
        <button class="btn-icon" style="font-size:13px;padding:4px 8px;" onclick="deleteCat('${c.id}')">🗑️</button>
      </div>` : ''}
    </div>`).join('');

  document.getElementById('cat-expense-grid').innerHTML = renderCatGrid(expense);
  document.getElementById('cat-income-grid').innerHTML  = renderCatGrid(income);
}

/* ═══════════════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════════════ */
function renderReports() {
  const uid = currentUser.id;
  const { year, month } = reportMonth;
  const txs  = DB.Transactions.getByMonth(uid, year, month);
  const cats = DB.Categories.getAll(uid);

  const income  = DB.Transactions.sumByType(txs, 'income');
  const expense = DB.Transactions.sumByType(txs, 'expense');
  const net     = income - expense;
  const savings = income > 0 ? Math.round((net / income) * 100) : 0;

  document.getElementById('report-month-label').textContent = monthLabel(year, month);
  document.getElementById('report-income').textContent  = fmt(income);
  document.getElementById('report-expense').textContent = fmt(expense);
  document.getElementById('report-net').textContent     = (net >= 0 ? '+' : '') + fmt(net);
  document.getElementById('report-net').style.color    = net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('report-savings-pct').textContent = Math.max(0, savings) + '%';
  document.getElementById('report-savings-bar').style.width = Math.min(100, Math.max(0, savings)) + '%';
  document.getElementById('report-tx-count').textContent = txs.length;

  // Daily line chart
  const daily = DB.Transactions.dailySummary(uid, year, month);
  Charts.renderDailyLine('report-daily-chart', daily);

  // Category breakdown
  const expTxs = txs.filter(t => t.type === 'expense');
  const catBreakdown = DB.Transactions.sumByCategory(expTxs);
  Charts.renderReportDoughnut('report-cat-chart', catBreakdown, cats);

  // Top categories table
  const sorted = Object.entries(catBreakdown).sort(([,a],[,b]) => b - a).slice(0, 5);
  const maxVal = sorted[0]?.[1] || 1;
  document.getElementById('report-top-cats').innerHTML = sorted.length
    ? sorted.map(([id, val]) => {
        const cat = cats.find(c => c.id === id) || { name: id, icon: '📦', color: '#6b7280' };
        const pct = Math.round((val / maxVal) * 100);
        return `
          <div class="top-cat-item">
            <span style="font-size:20px">${cat.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${cat.name}</div>
              <div class="top-cat-bar-wrap">
                <div class="top-cat-bar-fill" style="width:${pct}%;background:${cat.color};"></div>
              </div>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--accent-red);">${fmt(val)}</span>
          </div>`;
      }).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No expenses this month.</div>';
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════════════════ */
function renderAnalytics() {
  const uid = currentUser.id;
  const now = new Date();
  const allTxs = DB.Transactions.getAll(uid);
  const thisMonthTxs = DB.Transactions.getByMonth(uid, now.getFullYear(), now.getMonth() + 1);
  const cats = DB.Categories.getAll(uid);

  const totalIncome  = DB.Transactions.sumByType(allTxs, 'income');
  const totalExpense = DB.Transactions.sumByType(allTxs, 'expense');
  const balance      = totalIncome - totalExpense;
  const savings      = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  // Current month
  const mIncome  = DB.Transactions.sumByType(thisMonthTxs, 'income');
  const mExpense = DB.Transactions.sumByType(thisMonthTxs, 'expense');

  // Avg daily (this month up to today)
  const todayDay = now.getDate();
  const avgDaily = todayDay > 0 ? (mExpense / todayDay) : 0;

  document.getElementById('an-balance').textContent       = fmt(balance);
  document.getElementById('an-savings').textContent       = Math.max(0, savings) + '%';
  document.getElementById('an-savings-bar').style.width   = Math.min(100, Math.max(0, savings)) + '%';
  document.getElementById('an-avg-daily').textContent     = fmt(avgDaily);
  document.getElementById('an-total-tx').textContent      = allTxs.length;
  document.getElementById('an-this-income').textContent   = fmtShort(mIncome);
  document.getElementById('an-this-expense').textContent  = fmtShort(mExpense);

  // 6-month trend
  const data6m = DB.Transactions.last6MonthsSummary(uid);
  Charts.render6MonthTrend('an-trend-chart', data6m);

  // Top spending categories (all time)
  const expAll = allTxs.filter(t => t.type === 'expense');
  const allCatBreakdown = DB.Transactions.sumByCategory(expAll);
  const top5 = Object.entries(allCatBreakdown).sort(([,a],[,b]) => b - a).slice(0, 5);
  const maxV = top5[0]?.[1] || 1;
  document.getElementById('an-top-cats').innerHTML = top5.length
    ? top5.map(([id, val]) => {
        const cat = cats.find(c => c.id === id) || { name: id, icon: '📦', color: '#6b7280' };
        const pct = Math.round((val / maxV) * 100);
        return `
          <div class="top-cat-item">
            <span style="font-size:20px">${cat.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${cat.name}</div>
              <div class="top-cat-bar-wrap">
                <div class="top-cat-bar-fill" style="width:${pct}%;background:${cat.color};"></div>
              </div>
            </div>
            <span style="font-size:13px;font-weight:700;">${fmt(val)}</span>
          </div>`;
      }).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No expense data yet.</div>';
}

/* ═══════════════════════════════════════════════════════════
   TRANSACTION MODAL
   ═══════════════════════════════════════════════════════════ */
function openAddTx() {
  editingTxId = null;
  document.getElementById('tx-modal-title').textContent = 'Add Transaction';
  document.getElementById('tx-form').reset();
  document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('tx-delete-btn').style.display = 'none';
  setTxType('expense');
  renderTxCatGrid('expense');
  openModal('tx-modal');
}

function openEditTx(id) {
  const uid = currentUser.id;
  const tx = DB.Transactions.findById(uid, id);
  if (!tx) return;
  editingTxId = id;

  document.getElementById('tx-modal-title').textContent = 'Edit Transaction';
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-description').value = tx.description;
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-delete-btn').style.display = '';

  setTxType(tx.type);
  renderTxCatGrid(tx.type, tx.categoryId);
  openModal('tx-modal');
}

let selectedType = 'expense';
let selectedCatId = null;

function setTxType(type) {
  selectedType = type;
  document.getElementById('type-income-btn').className  = `type-btn ${type === 'income'  ? 'active-income'  : ''}`;
  document.getElementById('type-expense-btn').className = `type-btn ${type === 'expense' ? 'active-expense' : ''}`;
  renderTxCatGrid(type, null);
}

function renderTxCatGrid(type, selectedId = null) {
  selectedCatId = selectedId || null;
  const uid  = currentUser.id;
  const cats = DB.Categories.getByType(uid, type);
  const grid = document.getElementById('tx-cat-grid');
  grid.innerHTML = cats.map(c => `
    <button class="cat-select-item ${selectedCatId === c.id ? 'selected' : ''}"
            onclick="selectCat('${c.id}')" type="button">
      <span class="cat-sel-emoji">${c.icon}</span>
      <span class="cat-sel-name">${c.name}</span>
    </button>`).join('');
  if (selectedId) {
    setTimeout(() => {
      const el = grid.querySelector(`[onclick="selectCat('${selectedId}')"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 50);
  }
}

function selectCat(id) {
  selectedCatId = id;
  document.querySelectorAll('.cat-select-item').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('onclick') === `selectCat('${id}')`);
  });
}

function saveTx() {
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const description = document.getElementById('tx-description').value.trim();
  const date  = document.getElementById('tx-date').value;

  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  if (!selectedCatId) { showToast('Please select a category', 'error'); return; }
  if (!date) { showToast('Please select a date', 'error'); return; }

  const uid = currentUser.id;
  if (editingTxId) {
    DB.Transactions.update(uid, editingTxId, { amount, type: selectedType, categoryId: selectedCatId, description, date });
    showToast('Transaction updated', 'success');
  } else {
    DB.Transactions.create(uid, { amount, type: selectedType, categoryId: selectedCatId, description, date });
    showToast('Transaction added', 'success');
  }

  closeModal('tx-modal');
  if (currentPage === 'dashboard')    renderDashboard();
  if (currentPage === 'transactions') renderTransactions();
  if (currentPage === 'reports')      renderReports();
  if (currentPage === 'analytics')    renderAnalytics();
}

function deleteTx() {
  if (!editingTxId) return;
  if (!confirm('Delete this transaction?')) return;
  DB.Transactions.delete(currentUser.id, editingTxId);
  showToast('Transaction deleted', 'info');
  closeModal('tx-modal');
  navigateTo(currentPage);
}

/* ═══════════════════════════════════════════════════════════
   CATEGORY MODAL
   ═══════════════════════════════════════════════════════════ */
const EMOJI_OPTIONS = ['🍕','🛒','🚌','🏋️','📱','🎬','✂️','⚡','💊','🏠','🎓','🎵','🌿','🛠️','🐾','🍺','☕','🎁','💸','🔧'];

function openAddCat() {
  document.getElementById('cat-form').reset();
  document.getElementById('cat-modal-title').textContent = 'Add Category';
  document.getElementById('cat-type-select').value = 'expense';
  renderEmojiPicker(EMOJI_OPTIONS[0]);
  openModal('cat-modal');
}

function renderEmojiPicker(selected) {
  document.getElementById('cat-emoji-selected').textContent = selected;
  document.getElementById('cat-emoji-grid').innerHTML = EMOJI_OPTIONS.map(e => `
    <button type="button" class="type-btn ${e === selected ? 'active-income' : ''}"
            style="font-size:20px;padding:8px;" onclick="selectEmoji('${e}')">${e}</button>`).join('');
}

function selectEmoji(emoji) {
  renderEmojiPicker(emoji);
}

function saveCat() {
  const name  = document.getElementById('cat-name').value.trim();
  const type  = document.getElementById('cat-type-select').value;
  const icon  = document.getElementById('cat-emoji-selected').textContent;
  const color = document.getElementById('cat-color').value;

  if (!name) { showToast('Category name is required', 'error'); return; }

  DB.Categories.create(currentUser.id, { name, icon, color, type });
  showToast('Category created', 'success');
  closeModal('cat-modal');
  renderCategories();
}

function deleteCat(id) {
  if (!confirm('Delete this category?')) return;
  DB.Categories.delete(currentUser.id, id);
  showToast('Category deleted', 'info');
  renderCategories();
}

/* ═══════════════════════════════════════════════════════════
   MODAL HELPERS
   ═══════════════════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════ */
function emptyStateHTML(icon, title, desc) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <h3>${title}</h3>
    <p>${desc}</p>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Check session
  const user = Auth.currentUser();
  if (user) {
    showApp(user);
  }

  // Auth forms
  initAuth();

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });

  // FAB
  document.getElementById('fab-add').addEventListener('click', openAddTx);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    Auth.logout();
    showAuth();
    showToast('Logged out successfully', 'info');
  });

  // Tx modal
  document.getElementById('type-income-btn').addEventListener('click',  () => setTxType('income'));
  document.getElementById('type-expense-btn').addEventListener('click', () => setTxType('expense'));
  document.getElementById('btn-save-tx').addEventListener('click', saveTx);
  document.getElementById('tx-delete-btn').addEventListener('click', deleteTx);
  document.getElementById('tx-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('tx-modal')) closeModal('tx-modal');
  });

  // Cat modal
  document.getElementById('btn-add-cat').addEventListener('click', openAddCat);
  document.getElementById('btn-save-cat').addEventListener('click', saveCat);
  document.getElementById('cat-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('cat-modal')) closeModal('cat-modal');
  });
  document.getElementById('cat-type-select').addEventListener('change', () => {
    renderEmojiPicker(document.getElementById('cat-emoji-selected').textContent);
  });

  // Tx search
  document.getElementById('tx-search').addEventListener('input', (e) => {
    txSearch = e.target.value;
    renderTransactions();
  });

  // Tx filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      txFilter = chip.dataset.filter;
      renderTransactions();
    });
  });

  // Month picker (reports)
  document.getElementById('report-prev-month').addEventListener('click', () => {
    reportMonth.month--;
    if (reportMonth.month < 1) { reportMonth.month = 12; reportMonth.year--; }
    renderReports();
  });
  document.getElementById('report-next-month').addEventListener('click', () => {
    reportMonth.month++;
    if (reportMonth.month > 12) { reportMonth.month = 1; reportMonth.year++; }
    renderReports();
  });

  // Close modals on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('tx-modal');
      closeModal('cat-modal');
    }
  });
});
