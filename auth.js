/**
 * Onlywork Auth — real API client.
 * Access token: in-memory only (never persisted).
 * Refresh token: httpOnly cookie managed by the server.
 * User info (name, email, role): sessionStorage for quick reads.
 */
(function () {
  var SESSION_KEY = 'onlywork_user_v2';
  var _accessToken = null;

  // ── Internal helpers ─────────────────────────────────────────────────────

  function getUser() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function setUser(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  function clearUser() {
    sessionStorage.removeItem(SESSION_KEY);
    _accessToken = null;
  }

  function currentPageFile() {
    var parts = location.pathname.split('/').filter(Boolean);
    var last = parts.length ? parts[parts.length - 1] : '';
    return (last && last.indexOf('.html') !== -1) ? last : 'tasks.html';
  }

  function showError(msg) {
    var el = document.querySelector('.form-error, #login-error, #signup-error');
    if (el) el.textContent = msg;
  }

  // ── API base URL ─────────────────────────────────────────────────────────
  // When using the backend to serve the frontend (recommended), /api works.
  // For separate dev server, set window.ONLYWORK_API = 'http://localhost:3000/api'.
  function apiBase() {
    return (window.ONLYWORK_API) || '/api';
  }

  // ── Core fetch with auth header ───────────────────────────────────────────
  async function apiFetch(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (_accessToken) headers['Authorization'] = 'Bearer ' + _accessToken;
    var res = await fetch(apiBase() + path, {
      method: method,
      headers: headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  // ── Auth actions ──────────────────────────────────────────────────────────

  async function signup(data) {
    var json = await apiFetch('POST', '/auth/signup', {
      name: (data.name || '').trim(),
      email: (data.email || '').trim().toLowerCase(),
      password: data.password || '',
    });
    if (json.ok) {
      _accessToken = json.data.accessToken;
      setUser(json.data.user);
    }
    return json;
  }

  async function login(data) {
    var json = await apiFetch('POST', '/auth/login', {
      email: (data.email || '').trim().toLowerCase(),
      password: data.password || '',
    });
    if (json.ok) {
      _accessToken = json.data.accessToken;
      setUser(json.data.user);
    }
    return json;
  }

  async function logout() {
    await apiFetch('POST', '/auth/logout').catch(function () {});
    clearUser();
  }

  async function refresh() {
    var json = await fetch(apiBase() + '/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
    if (json.ok) {
      _accessToken = json.data.accessToken;
      if (json.data.user) setUser(json.data.user);
    } else {
      clearUser();
    }
    return json;
  }

  // ── Page guards ───────────────────────────────────────────────────────────

  // Fast sync check used by existing app pages (reads sessionStorage).
  // Returns truthy if the user appears to be logged in.
  function getSession() { return getUser(); }

  // Async guard: tries token refresh, redirects to login on failure.
  async function guardAppPage() {
    var result = await refresh();
    if (!result.ok) {
      location.replace('login.html?next=' + encodeURIComponent(currentPageFile()));
      return false;
    }
    return true;
  }

  // Async redirect: if session is still valid, redirect away from auth pages.
  async function redirectIfAuthed() {
    var result = await refresh();
    if (!result.ok) return;
    var params = new URLSearchParams(location.search);
    var next = params.get('next');
    if (next && /\.html$/i.test(next) && next.indexOf('..') === -1) {
      location.replace(next);
    } else {
      location.replace('tasks.html');
    }
  }

  // ── Header init ───────────────────────────────────────────────────────────

  function initMarketingHeader() {
    var user = getUser();
    document.querySelectorAll('.js-logged-out-only').forEach(function (el) {
      el.hidden = !!user;
    });
    document.querySelectorAll('.js-logged-in-only').forEach(function (el) {
      el.hidden = !user;
    });
    var label = document.getElementById('header-user-label');
    if (label && user) label.textContent = user.name || 'Workspace';
  }

  function initAppHeader() {
    var user = getUser();
    if (!user) return;
    var nameEl = document.getElementById('app-user-name');
    if (nameEl) nameEl.textContent = user.name || user.email;

    // Dynamically inject extra nav links based on role
    var nav = document.querySelector('.app-nav');
    if (nav) {
      var page = currentPageFile();

      // Add Dashboard link if not present
      if (!nav.querySelector('[href="dashboard.html"]')) {
        var dash = document.createElement('a');
        dash.href = 'dashboard.html';
        dash.textContent = 'Dashboard';
        if (page === 'dashboard.html') dash.classList.add('is-active');
        nav.insertBefore(dash, nav.firstChild);
      }

      // Add Admin link if user is admin
      if (user.role === 'ADMIN' && !nav.querySelector('[href="admin.html"]')) {
        var adm = document.createElement('a');
        adm.href = 'admin.html';
        adm.textContent = 'Admin';
        if (page === 'admin.html') adm.classList.add('is-active');
        nav.appendChild(adm);
      }

      // Add Profile link
      if (!nav.querySelector('[href="profile.html"]')) {
        var prof = document.createElement('a');
        prof.href = 'profile.html';
        prof.textContent = 'Profile';
        if (page === 'profile.html') prof.classList.add('is-active');
        nav.appendChild(prof);
      }
    }

    var btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', async function () {
        await logout();
        location.href = 'index.html';
      });
    }
  }

  // ── Toast notifications ──────────────────────────────────────────────────
  function showToast(message, type) {
    type = type || 'success';
    var colors = {
      success: 'rgba(52,211,153,0.15)',
      error: 'rgba(248,113,113,0.15)',
      info: 'rgba(139,92,246,0.15)',
    };
    var borderColors = {
      success: 'rgba(52,211,153,0.4)',
      error: 'rgba(248,113,113,0.4)',
      info: 'rgba(139,92,246,0.4)',
    };
    var toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '9999',
      padding: '14px 20px',
      borderRadius: '12px',
      background: colors[type] || colors.info,
      border: '1px solid ' + (borderColors[type] || borderColors.info),
      color: '#f4f4f5',
      fontSize: '0.9rem',
      fontFamily: 'Inter,system-ui,sans-serif',
      maxWidth: '360px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      transform: 'translateY(12px)',
      opacity: '0',
      transition: 'transform 0.25s ease, opacity 0.25s ease',
    });
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });
    setTimeout(function () {
      toast.style.transform = 'translateY(12px)';
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.OnlyworkAuth = {
    signup: signup,
    login: login,
    logout: logout,
    refresh: refresh,
    getUser: getUser,
    getSession: getSession,          // alias — keeps existing app pages working
    getAccessToken: function () { return _accessToken; },
    setAccessToken: function (t) { _accessToken = t; },
    guardAppPage: guardAppPage,
    redirectIfAuthed: redirectIfAuthed,
    initMarketingHeader: initMarketingHeader,
    initAppHeader: initAppHeader,
    currentPageFile: currentPageFile,
    showToast: showToast,
    apiBase: apiBase,
  };
})();
