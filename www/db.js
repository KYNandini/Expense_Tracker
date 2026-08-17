/**
 * db.js — Firebase Cloud Sync & LocalStorage Database
 * Implements a Local-First architecture. Data is stored in localStorage
 * for instant UI updates, and synced to Firebase Firestore in the background.
 */

// ⚠️ REPLACE THIS WITH YOUR ACTUAL FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBNjfpyzmNex-xZn6KbC2t9OUtJ_V3Bh0Y",
  authDomain: "expensetracker-23314.firebaseapp.com",
  projectId: "expensetracker-23314",
  storageBucket: "expensetracker-23314.firebasestorage.app",
  messagingSenderId: "129768673005",
  appId: "1:129768673005:web:c47efcdbb462ed1051c6e4",
  measurementId: "G-185E1EMJ9T"
};

let dbCloud = null;
if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  dbCloud = firebase.firestore();
}

const DB = (() => {
  // ─── Key Helpers ────────────────────────────────────────────────────────────
  const USERS_KEY = 'et_users';
  const SESSION_KEY = 'et_session';
  const txKey = (uid) => `et_transactions_${uid}`;
  const catKey = (uid) => `et_categories_${uid}`;

  // ─── JSON helpers ────────────────────────────────────────────────────────────
  const get = (key) => JSON.parse(localStorage.getItem(key) || 'null');
  
  let syncTimeout = null;
  const syncToCloud = (uid) => {
    if (!dbCloud || !uid) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      const payload = {
        categories: get(catKey(uid)) || [],
        transactions: get(txKey(uid)) || []
      };
      dbCloud.collection('user_data').doc(uid).set(payload, { merge: true }).catch(console.error);
    }, 1000);
  };

  const syncCloudUsers = () => {
    if (!dbCloud) return;
    const users = get(USERS_KEY) || [];
    dbCloud.collection('global').doc('users').set({ users }, { merge: true }).catch(console.error);
  };

  const fetchCloudUsers = async () => {
    if (!dbCloud) return;
    try {
      const doc = await dbCloud.collection('global').doc('users').get();
      if (doc.exists) {
        const cloudUsers = doc.data().users || [];
        const localUsers = get(USERS_KEY) || [];
        const merged = [...localUsers];
        for (const cu of cloudUsers) {
          if (!merged.find(u => u.id === cu.id)) merged.push(cu);
        }
        localStorage.setItem(USERS_KEY, JSON.stringify(merged));
      }
    } catch(e) { console.error(e); }
  };

  let unsubscribe = null;
  const listenToCloud = (uid) => {
    if (!dbCloud || !uid) return;
    if (unsubscribe) unsubscribe();
    unsubscribe = dbCloud.collection('user_data').doc(uid).onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        if (data.categories) localStorage.setItem(catKey(uid), JSON.stringify(data.categories));
        if (data.transactions) localStorage.setItem(txKey(uid), JSON.stringify(data.transactions));
        if (typeof navigateTo === 'function' && typeof currentPage !== 'undefined') {
           navigateTo(currentPage);
        }
      }
    });
  };

  const stopListen = () => {
    if (unsubscribe) unsubscribe();
  };

  const set = (key, val) => {
    localStorage.setItem(key, JSON.stringify(val));
    const s = get(SESSION_KEY);
    if (s && s.userId) {
       if (key === catKey(s.userId) || key === txKey(s.userId)) {
           syncToCloud(s.userId);
       }
    }
  };

  // ─── Default Categories ──────────────────────────────────────────────────────
  const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'cat_food',        name: 'Food & Dining',   icon: '🍔', color: '#f97316', type: 'expense' },
    { id: 'cat_transport',   name: 'Transport',        icon: '🚗', color: '#06b6d4', type: 'expense' },
    { id: 'cat_shopping',    name: 'Shopping',         icon: '🛍️', color: '#ec4899', type: 'expense' },
    { id: 'cat_bills',       name: 'Bills & Utilities',icon: '💡', color: '#eab308', type: 'expense' },
    { id: 'cat_health',      name: 'Health & Medical', icon: '❤️', color: '#ef4444', type: 'expense' },
    { id: 'cat_education',   name: 'Education',        icon: '📚', color: '#8b5cf6', type: 'expense' },
    { id: 'cat_entertain',   name: 'Entertainment',    icon: '🎮', color: '#a78bfa', type: 'expense' },
    { id: 'cat_travel',      name: 'Travel',           icon: '✈️', color: '#14b8a6', type: 'expense' },
    { id: 'cat_personal',    name: 'Personal Care',    icon: '💄', color: '#f472b6', type: 'expense' },
    { id: 'cat_other_exp',   name: 'Other',            icon: '📦', color: '#6b7280', type: 'expense' },
  ];
  const DEFAULT_INCOME_CATEGORIES = [
    { id: 'cat_salary',      name: 'Salary',           icon: '💼', color: '#22c55e', type: 'income' },
    { id: 'cat_freelance',   name: 'Freelance',        icon: '💻', color: '#10b981', type: 'income' },
    { id: 'cat_investment',  name: 'Investment',       icon: '📈', color: '#6366f1', type: 'income' },
    { id: 'cat_gift',        name: 'Gift / Bonus',     icon: '🎁', color: '#f59e0b', type: 'income' },
    { id: 'cat_rental',      name: 'Rental Income',    icon: '🏠', color: '#0ea5e9', type: 'income' },
    { id: 'cat_other_inc',   name: 'Other Income',     icon: '💰', color: '#84cc16', type: 'income' },
  ];
  const DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

  // ─── Users ───────────────────────────────────────────────────────────────────
  const Users = {
    getAll() { return get(USERS_KEY) || []; },
    findByUsername(username) {
      return this.getAll().find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
    },
    findById(id) {
      return this.getAll().find(u => u.id === id) || null;
    },
    create({ username, passwordHash, name }) {
      const users = this.getAll();
      if (this.findByUsername(username)) return null;
      const user = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        username,
        passwordHash,
        name: name || username,
        createdAt: new Date().toISOString(),
        currency: '₹',
      };
      users.push(user);
      set(USERS_KEY, users);
      syncCloudUsers();
      // Seed default categories for new user
      Categories.seedDefaults(user.id);
      return user;
    },
    update(id, updates) {
      const users = this.getAll();
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      users[idx] = { ...users[idx], ...updates };
      set(USERS_KEY, users);
      return users[idx];
    }
  };

  // ─── Session ─────────────────────────────────────────────────────────────────
  const Session = {
    get() { return get(SESSION_KEY); },
    set(userId) { set(SESSION_KEY, { userId, loginAt: new Date().toISOString() }); },
    clear() { localStorage.removeItem(SESSION_KEY); },
    currentUser() {
      const s = this.get();
      if (!s) return null;
      return Users.findById(s.userId) || null;
    }
  };

  // ─── Categories ──────────────────────────────────────────────────────────────
  const Categories = {
    getAll(userId) { return get(catKey(userId)) || []; },
    getByType(userId, type) { return this.getAll(userId).filter(c => c.type === type); },
    findById(userId, id) { return this.getAll(userId).find(c => c.id === id) || null; },
    seedDefaults(userId) {
      if (!get(catKey(userId))) {
        set(catKey(userId), DEFAULT_CATEGORIES.map(c => ({ ...c })));
      }
    },
    create(userId, { name, icon, color, type }) {
      const cats = this.getAll(userId);
      const cat = {
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name, icon, color, type,
        custom: true,
        createdAt: new Date().toISOString(),
      };
      cats.push(cat);
      set(catKey(userId), cats);
      return cat;
    },
    update(userId, id, updates) {
      const cats = this.getAll(userId);
      const idx = cats.findIndex(c => c.id === id);
      if (idx === -1) return null;
      cats[idx] = { ...cats[idx], ...updates };
      set(catKey(userId), cats);
      return cats[idx];
    },
    delete(userId, id) {
      const cats = this.getAll(userId).filter(c => c.id !== id);
      set(catKey(userId), cats);
    }
  };

  // ─── Transactions ────────────────────────────────────────────────────────────
  const Transactions = {
    getAll(userId) { return get(txKey(userId)) || []; },
    findById(userId, id) { return this.getAll(userId).find(t => t.id === id) || null; },

    create(userId, { amount, type, categoryId, description, date }) {
      const txs = this.getAll(userId);
      const tx = {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        amount: parseFloat(amount),
        type,           // 'income' | 'expense'
        categoryId,
        description: description || '',
        date: date || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      };
      txs.unshift(tx); // newest first
      set(txKey(userId), txs);
      return tx;
    },

    update(userId, id, updates) {
      const txs = this.getAll(userId);
      const idx = txs.findIndex(t => t.id === id);
      if (idx === -1) return null;
      txs[idx] = { ...txs[idx], ...updates, amount: parseFloat(updates.amount || txs[idx].amount) };
      set(txKey(userId), txs);
      return txs[idx];
    },

    delete(userId, id) {
      const txs = this.getAll(userId).filter(t => t.id !== id);
      set(txKey(userId), txs);
    },

    // ─── Filters ──────────────────────────────────────────────────────────────
    getByMonth(userId, year, month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      return this.getAll(userId).filter(t => t.date.startsWith(prefix));
    },

    getByDateRange(userId, from, to) {
      return this.getAll(userId).filter(t => t.date >= from && t.date <= to);
    },

    getByType(userId, type) {
      return this.getAll(userId).filter(t => t.type === type);
    },

    // ─── Aggregations ─────────────────────────────────────────────────────────
    sumByType(txList, type) {
      return txList.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
    },

    sumByCategory(txList) {
      return txList.reduce((acc, t) => {
        acc[t.categoryId] = (acc[t.categoryId] || 0) + t.amount;
        return acc;
      }, {});
    },

    // Last 6 months summary
    last6MonthsSummary(userId) {
      const results = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const txs = this.getByMonth(userId, year, month);
        results.push({
          label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
          income: this.sumByType(txs, 'income'),
          expense: this.sumByType(txs, 'expense'),
          month, year,
        });
      }
      return results;
    },

    // Day-by-day for a given month
    dailySummary(userId, year, month) {
      const txs = this.getByMonth(userId, year, month);
      const daysInMonth = new Date(year, month, 0).getDate();
      const days = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        days[key] = { income: 0, expense: 0 };
      }
      txs.forEach(t => {
        if (days[t.date]) {
          days[t.date][t.type] += t.amount;
        }
      });
      return days;
    }
  };

  // ─── Public API ──────────────────────────────────────────────────────────────
  return { Users, Session, Categories, Transactions, fetchCloudUsers, listenToCloud, stopListen };
})();
