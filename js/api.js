/**
 * Onlywork API client.
 * Wraps fetch with: automatic Bearer token, 401 auto-refresh, error normalisation.
 * Requires auth.js to be loaded first.
 */
(function () {
  function base() {
    return window.OnlyworkAuth ? window.OnlyworkAuth.apiBase() : '/api';
  }

  async function request(method, path, body, isFormData) {
    async function doFetch(accessToken) {
      var headers = {};
      if (!isFormData) headers['Content-Type'] = 'application/json';
      if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
      return fetch(base() + path, {
        method: method,
        headers: headers,
        credentials: 'include',
        body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
      });
    }

    var token = window.OnlyworkAuth ? window.OnlyworkAuth.getAccessToken() : null;
    var res = await doFetch(token);

    if (res.status === 401 && window.OnlyworkAuth) {
      var refreshed = await window.OnlyworkAuth.refresh();
      if (!refreshed.ok) {
        var page = encodeURIComponent(
          window.OnlyworkAuth.currentPageFile ? window.OnlyworkAuth.currentPageFile() : 'tasks.html',
        );
        location.replace('login.html?next=' + page);
        return { ok: false, error: 'Session expired. Redirecting to login.' };
      }
      res = await doFetch(window.OnlyworkAuth.getAccessToken());
    }

    var json;
    try { json = await res.json(); }
    catch (_) { json = { ok: false, error: 'Invalid server response.' }; }

    if (!json.ok && window.OnlyworkAuth && window.OnlyworkAuth.showToast) {
      // Only auto-toast for unexpected server errors (5xx), not client errors
      if (res.status >= 500) {
        window.OnlyworkAuth.showToast(json.error || 'Server error.', 'error');
      }
    }
    return json;
  }

  window.OnlyworkAPI = {
    get: function (path) { return request('GET', path, null, false); },
    post: function (path, body) { return request('POST', path, body, false); },
    patch: function (path, body) { return request('PATCH', path, body, false); },
    delete: function (path) { return request('DELETE', path, null, false); },
    upload: function (path, formData) { return request('POST', path, formData, true); },
    uploadPatch: function (path, formData) { return request('PATCH', path, formData, true); },
  };
})();
