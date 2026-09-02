/**
 * Admin panel — tabs, task management, user management, payouts, analytics.
 */
(function () {
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function fmtMoney(n) { return '$' + Number(n).toFixed(2); }

  function badge(s) {
    var map = { OPEN:'badge--open', ASSIGNED:'badge--progress', IN_PROGRESS:'badge--progress',
      SUBMITTED:'badge--progress', COMPLETED:'badge--done', CANCELLED:'',
      PENDING:'badge--pending', PROCESSING:'badge--progress', PAID:'badge--done', FAILED:'badge--open',
      APPROVED:'badge--done', REJECTED:'badge--open',
      LOW:'badge--open', MEDIUM:'badge--progress', HIGH:'badge--progress', URGENT:'badge--done',
      WORKER:'badge--open', ADMIN:'badge--done' };
    return '<span class="badge ' + (map[s]||'') + '">' + escHtml(s.replace('_',' ')) + '</span>';
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  function setupTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('is-active'); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('is-active');
      });
    });
  }

  // ── Create Task ───────────────────────────────────────────────────────────
  function setupCreateTask() {
    var form = document.getElementById('create-task-form');
    var err = document.getElementById('create-error');
    var suc = document.getElementById('create-success');
    var fileInput = document.getElementById('ct-file');
    var fileLabel = document.getElementById('ct-file-label');

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        fileLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : 'Choose file…';
      });
    }

    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.textContent = ''; suc.textContent = '';
      var btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Creating…';

      var fd = new FormData(form);
      var json = await window.OnlyworkAPI.upload('/tasks', fd);
      btn.disabled = false; btn.textContent = 'Create task';

      if (!json.ok) { err.textContent = json.error || 'Failed to create task.'; return; }
      suc.textContent = 'Task created successfully!';
      form.reset();
      fileLabel.textContent = 'Choose file…';
      loadAllTasks();
    });
  }

  // ── All Tasks ─────────────────────────────────────────────────────────────
  async function loadAllTasks() {
    var json = await window.OnlyworkAPI.get('/tasks?limit=50');
    var tbody = document.getElementById('admin-tasks-tbody');
    if (!json.ok || !tbody) return;

    var tasks = json.data.tasks;
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No tasks.</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map(function (t) {
      return '<tr>' +
        '<td><a href="task-detail.html?id=' + escHtml(t.id) + '" style="color:var(--text);font-weight:500;">' + escHtml(t.title) + '</a></td>' +
        '<td>' + escHtml(t.category) + '</td>' +
        '<td>' + fmtMoney(t.payout) + '</td>' +
        '<td>' + badge(t.priority) + '</td>' +
        '<td>' + badge(t.status) + '</td>' +
        '<td style="color:var(--muted);font-size:0.85rem;">' + escHtml(t.worker ? t.worker.name : '—') + '</td>' +
        '<td class="task-actions">' +
          (t.status !== 'CANCELLED' && t.status !== 'COMPLETED'
            ? '<button class="btn btn-ghost btn-small" data-cancel="' + escHtml(t.id) + '">Cancel</button>'
            : '') +
        '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Cancel this task?')) return;
        var r = await window.OnlyworkAPI.delete('/tasks/' + btn.getAttribute('data-cancel'));
        if (r.ok) loadAllTasks();
        else window.OnlyworkAuth && window.OnlyworkAuth.showToast(r.error || 'Failed.', 'error');
      });
    });
  }

  // ── Pending Submissions ───────────────────────────────────────────────────
  async function loadPendingSubmissions() {
    var json = await window.OnlyworkAPI.get('/admin/submissions');
    var el = document.getElementById('pending-submissions-list');
    if (!json.ok || !el) return;

    var all = json.data.submissions.filter(function (s) { return s.status === 'PENDING'; });
    if (!all.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">No pending submissions.</p>';
      return;
    }

    el.innerHTML = all.map(function (s) {
      return '<div style="border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
        '<div><strong>' + escHtml(s.task.title) + '</strong><span style="color:var(--muted);font-size:0.85rem;"> — ' + escHtml(s.user.name) + '</span></div>' +
        '<span style="color:var(--muted);font-size:0.8rem;">' + fmtDate(s.createdAt) + '</span></div>' +
        '<p style="margin:0 0 12px;color:var(--text-secondary);font-size:0.9rem;">' + escHtml(s.content) + '</p>' +
        '<div class="review-form" data-submission-id="' + escHtml(s.id) + '" data-task-id="' + escHtml(s.taskId) + '">' +
        '<textarea placeholder="Feedback (required for rejection)…" style="display:block;width:100%;"></textarea>' +
        '<div class="task-actions">' +
        '<button class="btn btn-primary btn-small" data-action="approve">Approve</button>' +
        '<button class="btn btn-outline btn-small" data-action="reject">Request revision</button>' +
        '</div></div></div>';
    }).join('');

    el.querySelectorAll('.review-form').forEach(function (form) {
      var submissionId = form.getAttribute('data-submission-id');
      var taskId = form.getAttribute('data-task-id');
      var textarea = form.querySelector('textarea');
      form.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var action = btn.getAttribute('data-action');
          var status = action === 'approve' ? 'APPROVED' : 'REJECTED';
          var feedback = textarea ? textarea.value.trim() : '';
          if (status === 'REJECTED' && !feedback) {
            window.OnlyworkAuth && window.OnlyworkAuth.showToast('Please provide feedback for rejection.', 'error');
            return;
          }
          btn.disabled = true;
          var r = await window.OnlyworkAPI.patch('/tasks/' + taskId + '/review', { submissionId, status, feedback });
          btn.disabled = false;
          if (r.ok) {
            window.OnlyworkAuth && window.OnlyworkAuth.showToast('Submission ' + status.toLowerCase() + '.', 'success');
            loadPendingSubmissions();
            loadAllTasks();
          } else {
            window.OnlyworkAuth && window.OnlyworkAuth.showToast(r.error || 'Failed.', 'error');
          }
        });
      });
    });
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function loadUsers() {
    var json = await window.OnlyworkAPI.get('/admin/users');
    var tbody = document.getElementById('users-tbody');
    if (!json.ok || !tbody) return;

    var users = json.data.users;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No users.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(function (u) {
      var me = window.OnlyworkAuth && window.OnlyworkAuth.getUser();
      var isSelf = me && me.id === u.id;
      return '<tr>' +
        '<td style="font-weight:500;">' + escHtml(u.name) + '</td>' +
        '<td style="color:var(--muted);font-size:0.85rem;">' + escHtml(u.email) + '</td>' +
        '<td>' + badge(u.role) + '</td>' +
        '<td style="color:var(--muted);font-size:0.85rem;">' + fmtDate(u.createdAt) + '</td>' +
        '<td>' + (u._count ? u._count.tasks : '—') + '</td>' +
        '<td>' + (u.active ? '<span class="badge badge--done">Active</span>' : '<span class="badge badge--open">Deactivated</span>') + '</td>' +
        '<td class="task-actions">' +
          (!isSelf ? [
            u.role === 'WORKER'
              ? '<button class="btn btn-ghost btn-small" data-user-id="' + escHtml(u.id) + '" data-promote>Promote</button>'
              : '<button class="btn btn-ghost btn-small" data-user-id="' + escHtml(u.id) + '" data-demote>Demote</button>',
            u.active
              ? '<button class="btn btn-ghost btn-small" data-user-id="' + escHtml(u.id) + '" data-deactivate>Deactivate</button>'
              : '<button class="btn btn-ghost btn-small" data-user-id="' + escHtml(u.id) + '" data-activate>Activate</button>',
          ].join('') : '<span style="color:var(--muted-2);font-size:0.8rem;">(you)</span>') +
        '</td></tr>';
    }).join('');

    async function patchUser(id, data) {
      var r = await window.OnlyworkAPI.patch('/admin/users/' + id, data);
      if (r.ok) loadUsers();
      else window.OnlyworkAuth && window.OnlyworkAuth.showToast(r.error || 'Failed.', 'error');
    }

    tbody.querySelectorAll('[data-promote]').forEach(function (b) {
      b.addEventListener('click', function () { patchUser(b.getAttribute('data-user-id'), { role: 'ADMIN' }); });
    });
    tbody.querySelectorAll('[data-demote]').forEach(function (b) {
      b.addEventListener('click', function () { patchUser(b.getAttribute('data-user-id'), { role: 'WORKER' }); });
    });
    tbody.querySelectorAll('[data-deactivate]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Deactivate this account?')) patchUser(b.getAttribute('data-user-id'), { active: false });
      });
    });
    tbody.querySelectorAll('[data-activate]').forEach(function (b) {
      b.addEventListener('click', function () { patchUser(b.getAttribute('data-user-id'), { active: true }); });
    });
  }

  // ── Payouts ───────────────────────────────────────────────────────────────
  async function loadPayouts() {
    var json = await window.OnlyworkAPI.get('/admin/payouts');
    var tbody = document.getElementById('payouts-tbody');
    if (!json.ok || !tbody) return;

    var payouts = json.data.payouts;
    if (!payouts.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">No payouts.</td></tr>';
      return;
    }

    tbody.innerHTML = payouts.map(function (p) {
      return '<tr>' +
        '<td style="font-weight:500;">' + escHtml(p.user.name) + '</td>' +
        '<td>' + fmtMoney(p.amount) + '</td>' +
        '<td>' + badge(p.status) + '</td>' +
        '<td style="color:var(--muted);font-size:0.85rem;">' + fmtDate(p.createdAt) + '</td>' +
        '<td style="font-size:0.8rem;color:var(--muted);">' + escHtml(p.stripePayoutId || '—') + '</td>' +
        '<td class="task-actions">' +
          (p.status === 'PENDING'
            ? '<button class="btn btn-primary btn-small" data-process="' + escHtml(p.id) + '">Process</button>'
            : '') +
        '</td></tr>';
    }).join('');

    tbody.querySelectorAll('[data-process]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Process this payout via Stripe?')) return;
        btn.disabled = true; btn.textContent = 'Processing…';
        var r = await window.OnlyworkAPI.post('/payouts/process', { payoutId: btn.getAttribute('data-process') });
        if (r.ok) {
          window.OnlyworkAuth && window.OnlyworkAuth.showToast('Payout processed!', 'success');
          loadPayouts();
        } else {
          window.OnlyworkAuth && window.OnlyworkAuth.showToast(r.error || 'Failed.', 'error');
          btn.disabled = false; btn.textContent = 'Process';
        }
      });
    });
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  async function loadAnalytics() {
    var json = await window.OnlyworkAPI.get('/admin/analytics');
    if (!json.ok) return;
    var d = json.data;

    document.getElementById('an-total-tasks').textContent = d.totalTasks;
    document.getElementById('an-paid-out').textContent = fmtMoney(d.totalPaidOut);
    document.getElementById('an-workers').textContent = d.totalWorkers;
    document.getElementById('an-completed').textContent = d.tasksByStatus['COMPLETED'] || 0;

    var statusEl = document.getElementById('analytics-status-list');
    if (statusEl) {
      statusEl.innerHTML = Object.entries(d.tasksByStatus).map(function (kv) {
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.9rem;">' +
          '<span>' + badge(kv[0]) + '</span><strong>' + kv[1] + '</strong></div>';
      }).join('');
    }

    var topEl = document.getElementById('analytics-top-workers');
    if (topEl && d.topWorkers.length) {
      topEl.innerHTML = d.topWorkers.map(function (w, i) {
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.9rem;">' +
          '<span style="color:var(--muted-2);">#' + (i+1) + '</span> <span style="flex:1;margin:0 10px;">' + escHtml(w.name||'') + '</span>' +
          '<strong style="color:var(--success);">' + fmtMoney(w.totalEarned) + '</strong></div>';
      }).join('');
    } else if (topEl) {
      topEl.innerHTML = '<p style="color:var(--muted);">No data yet.</p>';
    }

    var catEl = document.getElementById('analytics-categories');
    if (catEl && d.tasksByCategory.length) {
      var max = Math.max.apply(null, d.tasksByCategory.map(function (c) { return c.count; }));
      catEl.innerHTML = d.tasksByCategory.map(function (c) {
        var pct = max > 0 ? Math.round((c.count / max) * 100) : 0;
        return '<div style="margin-bottom:10px;">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;">' +
          '<span>' + escHtml(c.category) + '</span><span style="color:var(--muted);">' + c.count + '</span></div>' +
          '<div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.06);">' +
          '<div style="height:6px;border-radius:999px;background:var(--accent);width:' + pct + '%;"></div></div></div>';
      }).join('');
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    if (window.OnlyworkAuth) {
      var ok = await window.OnlyworkAuth.guardAppPage();
      if (!ok) return;
      // Redirect non-admins
      var user = window.OnlyworkAuth.getUser();
      if (!user || user.role !== 'ADMIN') { location.replace('tasks.html'); return; }
      window.OnlyworkAuth.initAppHeader();
    }

    setupTabs();
    setupCreateTask();

    // Load data for active tab on demand
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        if (tab === 'users') loadUsers();
        if (tab === 'payouts') loadPayouts();
        if (tab === 'analytics') loadAnalytics();
      });
    });

    // Load initial tab data
    await Promise.all([loadAllTasks(), loadPendingSubmissions()]);
  });
})();
