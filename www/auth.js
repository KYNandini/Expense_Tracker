/**
 * auth.js — Authentication Logic
 * Handles user registration, login, logout, and session management.
 * Uses a simple djb2-based hash for password storage (client-side only).
 */

const Auth = (() => {
  // Simple hash function (not cryptographic, but sufficient for local app)
  function hashPassword(password) {
    let hash = 5381;
    for (let i = 0; i < password.length; i++) {
      hash = ((hash << 5) + hash) ^ password.charCodeAt(i);
      hash = hash & 0xffffffff; // keep 32 bits
    }
    // XOR fold with a salt
    const salt = 0xdeadbeef;
    return ((hash ^ salt) >>> 0).toString(16).padStart(8, '0') +
           (password.length * 7919).toString(16);
  }

  function validateUsername(username) {
    if (!username || username.trim().length < 3) return 'Username must be at least 3 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, underscores';
    if (username.length > 30) return 'Username must be at most 30 characters';
    return null;
  }

  function validatePassword(password) {
    if (!password || password.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  return {
    /**
     * Register a new user.
     * @returns {{ success: boolean, error?: string, user?: object }}
     */
    register({ username, password, name }) {
      const unErr = validateUsername(username);
      if (unErr) return { success: false, error: unErr };

      const pwErr = validatePassword(password);
      if (pwErr) return { success: false, error: pwErr };

      if (!name || name.trim().length < 1) return { success: false, error: 'Full name is required' };

      const existing = DB.Users.findByUsername(username);
      if (existing) return { success: false, error: 'Username already taken' };

      const user = DB.Users.create({
        username: username.trim(),
        passwordHash: hashPassword(password),
        name: name.trim(),
      });

      if (!user) return { success: false, error: 'Failed to create user' };

      DB.Session.set(user.id);
      return { success: true, user };
    },

    /**
     * Log in an existing user.
     * @returns {{ success: boolean, error?: string, user?: object }}
     */
    async login({ username, password }) {
      if (!username || !password) return { success: false, error: 'Please fill in all fields' };

      if (DB.fetchCloudUsers) await DB.fetchCloudUsers();

      const user = DB.Users.findByUsername(username);
      if (!user) return { success: false, error: 'User not found' };

      if (user.passwordHash !== hashPassword(password)) {
        return { success: false, error: 'Incorrect password' };
      }

      DB.Session.set(user.id);
      return { success: true, user };
    },

    /**
     * Log out the current user.
     */
    logout() {
      DB.Session.clear();
    },

    /**
     * Get current logged-in user, or null.
     */
    currentUser() {
      return DB.Session.currentUser();
    },

    /**
     * Check if any user is logged in.
     */
    isLoggedIn() {
      return !!DB.Session.currentUser();
    }
  };
})();
