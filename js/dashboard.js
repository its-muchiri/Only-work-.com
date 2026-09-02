/**
 * Dashboard page — loads stats, tasks, notifications, chart, and payouts.
 */
(function () {
  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtMoney(n) { return '$' + Number(n).toFixed(2); }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function statusBadge(s) {
    var map = { OPEN:'badge--open', ASSIGNED:'badge--progress', IN_PROGRESS:'badge--progress',
      SUBMITTED:'badge--progress', COMPLETED:'badge--done', CANCELLED:'',
      PENDING:'badge--pending', PROCESSING:'badge--progress', PAID:'badge--done', FAILED:'badge--open',
      APPROVED:'badge--done', REJECTED:'badge--open' };
    return '<span class="badge ' + (map[s] || '') + '">' + s.replace('_',' ') + '</span>';
  }

  async function loadStats() {
    var json = await window.OnlyworkAPI.get('/users/me/stats');
    if (!json.ok) return;
    var d = json.data;
    document.getElementById('stat-completed').textContent = d.tasksCompleted;
    document.getElementById('stat-earned').textContent = fmtMoney(d.totalEarned);
    document.getElementById('stat-pending').textContent = fmtMoney(d.pendingPayout);
    document.getElementById('stat-active').textContent = d.activeTasks;
  }

  async function loadActiveTasks() {
    var json = await window.OnlyworkAPI.get('/tasks/mine');
    if (!json.ok) return;
    var tbody = document.getElementById('active-tasks-tbody');
    var tasks = json.data.tasks;
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">No active tasks.</td></tr>';
      return;
    }
    tbody.innerHTML = tasks.map(function (t) {
      return '<tr>' +
        '<td><a href="task-detail.html?id=' + escHtml(t.id) + '" style="color:var(--text);font-weight:500;">' + escHtml(t.title) + '</a></td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '<td>' + fmtDate(t.deadline) + '</td>' +
        '<td><a class="btn btn-outline btn-small" href="task-detail.html?id=' + escHtml(t.id) + '">View</a></td>' +
        '</tr>';
    }).join('');
  }

  async function loadNotifications() {
    var json = await window.OnlyworkAPI.get('/users/me/notifications');
    if (!json.ok) return;
    var el = document.getElementById('notif-list');
    var notifs = json.data.notifications;
    if (!notifs.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">No notifications yet.</p>';
      return;
    }
    el.innerHTML = notifs.slice(0, 10).map(function (n) {
      return '<div class="notif-item" data-notif-id="' + escHtml(n.id) + '" style="cursor:pointer;">' +
        '<div class="notif-dot ' + (n.read ? 'notif-dot--read' : '') + '"></div>' +
        '<div><div class="notif-msg">' + escHtml(n.message) + '</div>' +
        '<div class="notif-time">' + fmtDate(n.createdAt) + '</div></div>' +
        '</div>';
    }).join('');

    el.querySelectorAll('[data-notif-id]').forEach(function (item) {
      item.addEventListener('click', async function () {
        var id = item.getAttribute('data-notif-id');
        await window.OnlyworkAPI.patch('/users/me/notifications/' + id + '/read');
        item.querySelector('.notif-dot').classList.add('notif-dot--read');
      });
    });
  }

  async function loadChart() {
    var json = await window.OnlyworkAPI.get('/users/me/earnings/monthly');
    if (!json.ok || !window.Chart) return;

    var monthly = json.data.monthly;
    // Build last 6 month labels
    var labels = [];
    var values = [];
    var now = new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      labels.push(label);
      values.push(monthly[key] || 0);
    }

    var ctx = document.getElementById('earnings-chart');
    if (!ctx) return;
    new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Earnings ($)',
          data: values,
          backgroundColor: 'rgba(139,92,246,0.35)',
          borderColor: 'rgba(167,139,250,0.8)',
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return '$' + Number(ctx.parsed.y).toFixed(2); },
            },
          },
        },
        scales: {
          x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#71717a', callback: function (v) { return '$' + v; } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  }

  async function loadSubmissions() {
    var json = await window.OnlyworkAPI.get('/users/me/submissions');
    if (!json.ok) return;
    var tbody = document.getElementById('submissions-tbody');
    var subs = json.data.submissions;
    if (!subs.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">No submissions yet.</td></tr>';
      return;
    }
    tbody.innerHTML = subs.map(function (s) {
      return '<tr>' +
        '<td><a href="task-detail.html?id=' + escHtml(s.task.id) + '" style="color:var(--text);">' + escHtml(s.task.title) + '</a></td>' +
        '<td>' + fmtDate(s.createdAt) + '</td>' +
        '<td>' + statusBadge(s.status) + '</td>' +
        '<td style="color:var(--muted);font-size:0.85rem;">' + escHtml(s.feedback || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  async function loadPayouts() {
    var json = await window.OnlyworkAPI.get('/payouts/my-payouts');
    if (!json.ok) return;
    var tbody = document.getElementById('payouts-tbody');
    var payouts = json.data.payouts;
    if (!payouts.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">No payouts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = payouts.map(function (p) {
      return '<tr>' +
        '<td>' + fmtDate(p.createdAt) + '</td>' +
        '<td>' + fmtMoney(p.amount) + '</td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td style="font-size:0.8rem;color:var(--muted);">' + escHtml(p.stripePayoutId || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  function setupMarkAllRead() {
    var btn = document.getElementById('mark-all-read');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      await window.OnlyworkAPI.post('/users/me/notifications/read-all');
      document.querySelectorAll('.notif-dot').forEach(function (d) { d.classList.add('notif-dot--read'); });
    });
  }

  function setupSocket() {
    if (!window.io || !window.OnlyworkAuth) return;
    var user = window.OnlyworkAuth.getUser();
    var socket = io();
    if (user) socket.emit('join', user.id);

    socket.on('task_approved', function () { loadStats(); loadPayouts(); });
    socket.on('task_rejected', function () { loadActiveTasks(); });
    socket.on('payout_processed', function () { loadStats(); loadPayouts(); });
    socket.on('notification', function () { loadNotifications(); });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (window.OnlyworkAuth) {
      var ok = await window.OnlyworkAuth.guardAppPage();
      if (!ok) return;
      window.OnlyworkAuth.initAppHeader();
    }

    setupMarkAllRead();
    setupSocket();

    await Promise.all([
      loadStats(),
      loadActiveTasks(),
      loadNotifications(),
      loadSubmissions(),
      loadPayouts(),
      loadChart(),
    ]);
  });
})();
