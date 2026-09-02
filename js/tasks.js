/**
 * Tasks page — fetches real tasks from API, handles claim, real-time updates.
 */
(function () {
  var state = {
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
    search: '',
    category: '',
    priority: '',
    debounceTimer: null,
  };

  function priorityBadge(p) {
    var map = {
      LOW: 'badge--open',
      MEDIUM: 'badge--progress',
      HIGH: 'badge--progress',
      URGENT: 'badge--done',
    };
    return '<span class="badge ' + (map[p] || 'badge--open') + '">' + p + '</span>';
  }

  function statusBadge(s) {
    var map = {
      OPEN: 'badge--open',
      ASSIGNED: 'badge--progress',
      IN_PROGRESS: 'badge--progress',
      SUBMITTED: 'badge--progress',
      COMPLETED: 'badge--done',
      CANCELLED: '',
    };
    var label = s.replace('_', ' ');
    return '<span class="badge ' + (map[s] || '') + '">' + label + '</span>';
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtPayout(n) {
    return '$' + Number(n).toFixed(2);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderTasks(tasks) {
    var tbody = document.getElementById('tasks-tbody');
    if (!tbody) return;

    if (!tasks || !tasks.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">No tasks found.</td></tr>';
      return;
    }

    var user = window.OnlyworkAuth ? window.OnlyworkAuth.getUser() : null;
    var userId = user ? user.id : null;

    tbody.innerHTML = tasks.map(function (t) {
      var isAssignedToMe = t.assignedTo === userId;
      var canClaim = t.status === 'OPEN' && userId;
      var actionBtn = '';

      if (isAssignedToMe) {
        actionBtn = '<a class="btn btn-outline btn-small" href="task-detail.html?id=' + escHtml(t.id) + '">View</a>';
      } else if (canClaim) {
        actionBtn = '<button type="button" class="btn btn-primary btn-small" data-claim="' + escHtml(t.id) + '">Claim</button>';
      } else {
        actionBtn = '<a class="btn btn-ghost btn-small" href="task-detail.html?id=' + escHtml(t.id) + '">View</a>';
      }

      return '<tr data-task-id="' + escHtml(t.id) + '">' +
        '<td><a href="task-detail.html?id=' + escHtml(t.id) + '" style="color:var(--text);font-weight:500;">' + escHtml(t.title) + '</a><br>' +
        '<span style="font-size:0.78rem;color:var(--muted);">' + escHtml(t.category) + '</span></td>' +
        '<td>' + fmtPayout(t.payout) + '</td>' +
        '<td>' + fmtDate(t.deadline) + '</td>' +
        '<td>' + priorityBadge(t.priority) + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '<td class="task-actions">' + actionBtn + '</td>' +
        '</tr>';
    }).join('');

    // Attach claim handlers
    tbody.querySelectorAll('[data-claim]').forEach(function (btn) {
      btn.addEventListener('click', function () { claimTask(btn.getAttribute('data-claim'), btn); });
    });
  }

  function renderPagination() {
    var el = document.getElementById('tasks-pagination');
    if (!el) return;
    if (state.pages <= 1) { el.innerHTML = ''; return; }

    var btns = '';
    btns += '<button type="button" onclick="TasksPage.goPage(' + (state.page - 1) + ')" ' +
      (state.page <= 1 ? 'disabled' : '') + ' class="btn btn-outline btn-small">&#8592; Prev</button> ';
    btns += '<span style="color:var(--muted);font-size:0.88rem;">Page ' + state.page + ' of ' + state.pages + '</span> ';
    btns += '<button type="button" onclick="TasksPage.goPage(' + (state.page + 1) + ')" ' +
      (state.page >= state.pages ? 'disabled' : '') + ' class="btn btn-outline btn-small">Next &#8594;</button>';
    el.innerHTML = btns;
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadTasks() {
    var params = new URLSearchParams();
    params.set('page', state.page);
    params.set('limit', state.limit);
    if (state.search) params.set('search', state.search);
    if (state.category) params.set('category', state.category);
    if (state.priority) params.set('priority', state.priority);

    var tbody = document.getElementById('tasks-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">Loading…</td></tr>';

    var json = await window.OnlyworkAPI.get('/tasks?' + params.toString());
    if (!json.ok) return;

    var d = json.data;
    state.total = d.pagination.total;
    state.pages = d.pagination.pages;
    renderTasks(d.tasks);
    renderPagination();

    var countEl = document.getElementById('tasks-count');
    if (countEl) countEl.textContent = d.pagination.total + ' task' + (d.pagination.total !== 1 ? 's' : '');
  }

  async function loadMyTasks() {
    var user = window.OnlyworkAuth ? window.OnlyworkAuth.getUser() : null;
    if (!user) return;

    var json = await window.OnlyworkAPI.get('/tasks/mine');
    if (!json.ok) return;

    var tbody = document.getElementById('my-tasks-tbody');
    if (!tbody) return;

    var tasks = json.data.tasks;
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">No active tasks yet.</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map(function (t) {
      return '<tr>' +
        '<td><a href="task-detail.html?id=' + escHtml(t.id) + '" style="color:var(--text);font-weight:500;">' + escHtml(t.title) + '</a></td>' +
        '<td>' + fmtPayout(t.payout) + '</td>' +
        '<td>' + fmtDate(t.deadline) + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '<td class="task-actions"><a class="btn btn-outline btn-small" href="task-detail.html?id=' + escHtml(t.id) + '">View</a></td>' +
        '</tr>';
    }).join('');
  }

  // ── Claim ─────────────────────────────────────────────────────────────────

  async function claimTask(taskId, btn) {
    btn.disabled = true;
    btn.textContent = 'Claiming…';
    var json = await window.OnlyworkAPI.post('/tasks/' + taskId + '/claim');
    if (json.ok) {
      if (window.OnlyworkAuth) window.OnlyworkAuth.showToast('Task claimed! Opening task…', 'success');
      setTimeout(function () { location.href = 'task-detail.html?id=' + taskId; }, 800);
    } else {
      if (window.OnlyworkAuth) window.OnlyworkAuth.showToast(json.error || 'Could not claim task.', 'error');
      btn.disabled = false;
      btn.textContent = 'Claim';
    }
  }

  // ── Search / filter ───────────────────────────────────────────────────────

  function setupSearch() {
    var searchEl = document.getElementById('tasks-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(function () {
          state.search = searchEl.value.trim();
          state.page = 1;
          loadTasks();
        }, 300);
      });
    }

    var catEl = document.getElementById('tasks-filter-category');
    if (catEl) {
      catEl.addEventListener('change', function () {
        state.category = catEl.value;
        state.page = 1;
        loadTasks();
      });
    }

    var priEl = document.getElementById('tasks-filter-priority');
    if (priEl) {
      priEl.addEventListener('change', function () {
        state.priority = priEl.value;
        state.page = 1;
        loadTasks();
      });
    }
  }

  // ── Socket.io real-time ───────────────────────────────────────────────────

  function setupSocket() {
    if (!window.io || !window.OnlyworkAuth) return;
    var user = window.OnlyworkAuth.getUser();
    var socket = io();
    if (user) socket.emit('join', user.id);

    socket.on('task_created', function () {
      if (window.OnlyworkAuth) window.OnlyworkAuth.showToast('New task available!', 'info');
      loadTasks();
    });
    socket.on('task_cancelled', function () { loadTasks(); });
    socket.on('task_claimed', function () { loadTasks(); });
    socket.on('task_approved', function (data) {
      window.OnlyworkAuth.showToast('Your work was approved! $' + Number(data.payout).toFixed(2) + ' payout queued.', 'success');
      loadMyTasks();
    });
    socket.on('task_rejected', function (data) {
      window.OnlyworkAuth.showToast('Revision requested: ' + (data.feedback || ''), 'error');
      loadMyTasks();
    });
    socket.on('payout_processed', function (data) {
      window.OnlyworkAuth.showToast('Payout of $' + Number(data.amount).toFixed(2) + ' processed!', 'success');
    });
    socket.on('notification', function (data) {
      window.OnlyworkAuth.showToast(data.message, 'info');
    });
  }

  // ── Notification badge ────────────────────────────────────────────────────

  async function loadNotificationCount() {
    var json = await window.OnlyworkAPI.get('/users/me/notifications');
    if (!json.ok) return;
    var unread = json.data.notifications.filter(function (n) { return !n.read; }).length;
    var badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread || '';
      badge.hidden = !unread;
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async function () {
    // Async guard — validate session via refresh
    if (window.OnlyworkAuth) {
      var ok = await window.OnlyworkAuth.guardAppPage();
      if (!ok) return;
      window.OnlyworkAuth.initAppHeader();
    }

    setupSearch();
    setupSocket();
    await Promise.all([loadTasks(), loadMyTasks(), loadNotificationCount()]);
  });

  // Expose for pagination onclick
  window.TasksPage = {
    goPage: function (p) {
      if (p < 1 || p > state.pages) return;
      state.page = p;
      loadTasks();
    },
  };
})();
