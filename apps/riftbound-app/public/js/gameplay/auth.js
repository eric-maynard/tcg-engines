// auth.js — Auth bar initialization (consistent with other pages)

(async function initAuthBar() {
  const bar = document.getElementById('authBar');
  function showLogin() { if (bar) bar.innerHTML = '<button class="auth-btn" onclick="location.href=\'/login\'">Login / Register</button>'; }
  function showUser(name) { currentUsername = name; if (bar) bar.innerHTML = '<span class="auth-user">' + name + ' <button class="auth-logout" onclick="document.cookie=\'rb_token=;max-age=0;path=/\';location.reload()">Logout</button></span>'; }

  const tokenCookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('rb_token='));
  const tokenValue = tokenCookie ? tokenCookie.split('=')[1] : '';
  if (tokenValue) {
    try {
      const r = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + tokenValue } });
      if (r.ok) { const d = await r.json(); if (d) { showUser(d.displayName || d.username || d.user?.displayName || d.user?.username); return; } }
      if (r.status === 401) { document.cookie = 'rb_token=;max-age=0;path=/'; }
    } catch { /* silently ignore auth check failures */ }
  }
  // Auto-login with dev credentials
  try {
    const cr = await fetch('/api/auth/dev-credentials');
    if (cr.ok) {
      const creds = await cr.json();
      if (creds && creds.username) {
        const lr = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.username, password: creds.password }) });
        const data = await lr.json();
        if (data && data.token) {
          document.cookie = 'rb_token=' + data.token + ';path=/;max-age=' + (30*86400) + ';SameSite=Lax';
          showUser(data.user.displayName || data.user.username); return;
        }
      }
    }
  } catch {}
  showLogin();
})();
