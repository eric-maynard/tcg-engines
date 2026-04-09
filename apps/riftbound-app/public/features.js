/**
 * Additional features: auth, save/load, sideboard, localStorage persistence.
 * Loaded after the main index.html script.
 */

// ========================================
// Cookie Helpers
// ========================================
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}
function deleteCookie(name) {
  document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
}

// ========================================
// Auth State (cookie first, localStorage fallback)
// ========================================
window.authToken = getCookie('rb_token') || localStorage.getItem('rb_token') || null;
window.currentUser = null;
window.sideboardCards = [];

// ========================================
// Auth UI
// ========================================
window.checkAuth = async function() {
  if (!window.authToken) { await tryDevAutoLogin(); updateAuthUI(); return; }
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + window.authToken } });
    if (res.ok) {
      window.currentUser = (await res.json()).user;
    } else {
      window.authToken = null;
      localStorage.removeItem('rb_token'); deleteCookie('rb_token');
      await tryDevAutoLogin();
    }
  } catch {}
  updateAuthUI();
};

async function tryDevAutoLogin() {
  try {
    const cr = await fetch('/api/auth/dev-credentials');
    if (!cr.ok) return;
    const creds = await cr.json();
    if (!creds || !creds.username) return;
    const lr = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password })
    });
    const data = await lr.json();
    if (data && data.token) {
      window.authToken = data.token;
      window.currentUser = data.user;
      localStorage.setItem('rb_token', data.token);
      setCookie('rb_token', data.token, 30);
    }
  } catch {}
}

function updateAuthUI() {
  const bar = document.getElementById('authBar');
  if (!bar) return;
  if (window.currentUser) {
    bar.innerHTML = '<span class="auth-user">' + window.currentUser.username +
      ' <button class="auth-logout" onclick="logout()">Logout</button></span>';
    loadMyDecks();
  } else {
    bar.innerHTML = '<a href="/login" style="color:#8a7aaa;font-size:12px;text-decoration:none;border:1px solid #3a3460;padding:4px 12px;border-radius:4px;">Sign In</a>';
  }
}

window.showLogin = function() {
  window.location.href = '/login';
};

function doRegister(u, p) {
  fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:u,password:p}) })
    .then(r => r.json()).then(d => {
      if (d.token) {
        window.authToken = d.token; window.currentUser = d.user;
        localStorage.setItem('rb_token', d.token); setCookie('rb_token', d.token, 30);
        updateAuthUI();
        showToast('Registered', 'Welcome ' + d.user.username, 'success');
      } else showToast('Failed', d.error || 'Try different username', 'error');
    }).catch(() => showToast('Error', 'Registration failed', 'error'));
}

window.showRegister = function() { window.location.href = '/login'; };

window.logout = function() {
  window.authToken = null; window.currentUser = null;
  localStorage.removeItem('rb_token'); deleteCookie('rb_token');
  updateAuthUI();
};

// ========================================
// Save Deck
// ========================================
// Track deck name — editable, defaults to champion name
window.deckName = '';

window.getDeckName = function() {
  if (window.deckName) return window.deckName;
  if (selectedChampionData?.name) return selectedChampionData.name;
  return 'Untitled Deck';
};

window.setDeckName = function(name) {
  window.deckName = name;
  const el = document.getElementById('deckTitle');
  if (el) el.value = name;
  // If input doesn't exist yet, it'll pick up the name from getDeckName() when injected
};

// Replace the "Deck" h1 with an editable title input.
// Called repeatedly until it succeeds, then on every champion change.
function injectDeckTitle() {
  const h1 = document.querySelector('.deck-header h1');
  if (h1) {
    h1.outerHTML = '<input id="deckTitle" type="text" value="' + getDeckName() +
      '" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" ' +
      'style="background:none;border:none;border-bottom:1px solid transparent;color:#c4a0ff;font-size:18px;font-weight:700;width:100%;outline:none;padding:2px 0;" ' +
      'onfocus="this.style.borderBottomColor=\'#5a3a9a\'" onblur="this.style.borderBottomColor=\'transparent\'" ' +
      'oninput="window.deckName=this.value" placeholder="Deck Name">';
    return true;
  }
  // Already injected — just update the value
  const existing = document.getElementById('deckTitle');
  if (existing && !window.deckName) {
    existing.value = getDeckName();
  }
  return !!existing;
}

// Keep trying until the element exists
let _titleInterval = setInterval(() => {
  if (injectDeckTitle()) clearInterval(_titleInterval);
}, 500);

window.saveDeck = async function() {
  if (!window.currentUser) { showToast('Sign in required', 'Login or register to save decks', 'error'); return; }
  if (!selectedLegendData || !selectedChampionData) {
    showToast('Incomplete', 'Select legend and champion first', 'error'); return;
  }

  // Auto-generate name from champion if not set
  let name = getDeckName();

  // Check for duplicate names and auto-increment
  if (window.authToken) {
    try {
      const res = await fetch('/api/saved-decks', { headers: { 'Authorization': 'Bearer ' + window.authToken } });
      if (res.ok) {
        const existingDecks = await res.json();
        const existingNames = existingDecks.map(d => d.name);
        let baseName = name;
        let counter = 2;
        while (existingNames.includes(name)) {
          name = baseName + ' (' + counter + ')';
          counter++;
        }
        if (name !== baseName) setDeckName(name);
      }
    } catch {}
  }

  // Get validation
  let validation = { valid: true, errors: [] };
  try {
    const vr = await fetch('/api/deck/' + sessionId + '/state');
    if (vr.ok) validation = (await vr.json()).validation || validation;
  } catch {}

  // Build cards array with zones
  const cards = [];
  const mainCopies = {};
  for (const c of (deckState?.mainDeck || [])) {
    mainCopies[c.id] = (mainCopies[c.id] || 0) + 1;
  }
  for (const [id, qty] of Object.entries(mainCopies)) {
    cards.push({ cardId: id, quantity: qty, zone: 'main' });
  }
  if (selectedChampionData) {
    const e = cards.find(c => c.cardId === selectedChampionData.id);
    if (e) e.quantity++; else cards.push({ cardId: selectedChampionData.id, quantity: 1, zone: 'main' });
  }
  const sbCopies = {};
  for (const c of window.sideboardCards) {
    sbCopies[c.id] = (sbCopies[c.id] || 0) + 1;
  }
  for (const [id, qty] of Object.entries(sbCopies)) {
    cards.push({ cardId: id, quantity: qty, zone: 'sideboard' });
  }
  const runeCopies = {};
  for (const r of (deckState?.runeDeck || [])) {
    runeCopies[r.id] = (runeCopies[r.id] || 0) + 1;
  }
  for (const [id, qty] of Object.entries(runeCopies)) {
    cards.push({ cardId: id, quantity: qty, zone: 'rune' });
  }

  try {
    const res = await fetch('/api/saved-decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.authToken },
      body: JSON.stringify({ name, legendId: selectedLegendData.id, championId: selectedChampionData.id, gameVersion: window.gameVersion || 'standard', isPublic: false, cards })
    });
    if (res.ok) {
      if (!validation.valid) {
        showToast('Saved with warnings', 'Deck "' + name + '" saved. Issues: ' + validation.errors.map(e => e.message).join('; '), 'error');
      } else {
        showToast('Deck Saved!', '"' + name + '" saved successfully', 'success');
      }
      loadMyDecks();
    } else showToast('Error', 'Could not save', 'error');
  } catch { showToast('Error', 'Save failed', 'error'); }
};

// ========================================
// My Decks
// ========================================
window.loadMyDecks = async function() {
  if (!window.authToken) return;
  const el = document.getElementById('myDecksList');
  if (!el) return;
  try {
    const res = await fetch('/api/saved-decks', { headers: { 'Authorization': 'Bearer ' + window.authToken } });
    if (!res.ok) return;
    const decks = await res.json();
    document.getElementById('myDecksSection').style.display = decks.length ? '' : 'none';
    el.innerHTML = decks.length === 0 ? '' : decks.map(d =>
      '<div style="display:flex;align-items:center;padding:3px 0;font-size:11px;cursor:pointer;color:#8a7aaa;" onclick="loadSavedDeck(\'' + d.id + '\')">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + d.name + '</span>' +
      '<span onclick="event.stopPropagation();deleteSavedDeck(\'' + d.id + '\')" style="color:#6a4a4a;cursor:pointer;margin-left:4px;">&#10005;</span></div>'
    ).join('');
  } catch {}
};

window.loadSavedDeck = function(id) {
  showToast('Load', 'Loading deck... (full load coming soon)', 'success');
};

// Confirm modal (injected once)
(function() {
  if (document.getElementById('confirmOverlay')) return;
  const style = document.createElement('style');
  style.textContent = `
    .confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:300;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s ease}
    .confirm-overlay.visible{opacity:1;pointer-events:auto}
    .confirm-box{background:#1e1b2e;border:1px solid #3a2f5a;border-radius:12px;padding:24px 28px;max-width:340px;width:90%;text-align:center}
    .confirm-box h3{margin:0 0 8px;font-size:15px;color:#e8e0f0}
    .confirm-box p{margin:0 0 20px;font-size:12px;color:#8a7fa0}
    .confirm-btns{display:flex;gap:10px;justify-content:center}
    .confirm-btns button{padding:8px 20px;border-radius:8px;border:none;font-size:12px;cursor:pointer;font-weight:600;transition:background .15s}
    .confirm-cancel{background:#2a2540;color:#a090c0}.confirm-cancel:hover{background:#352f50}
    .confirm-delete{background:#5a1a1a;color:#ff6b6b}.confirm-delete:hover{background:#7a2a2a}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.id = 'confirmOverlay';
  overlay.innerHTML = '<div class="confirm-box"><h3>Delete Deck</h3><p>Are you sure? This can\'t be undone.</p><div class="confirm-btns"><button class="confirm-cancel" id="fConfirmCancel">Cancel</button><button class="confirm-delete" id="fConfirmDelete">Delete</button></div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === this) closeConfirmModal(); });
  document.getElementById('fConfirmCancel').addEventListener('click', closeConfirmModal);
  document.getElementById('fConfirmDelete').addEventListener('click', async function() {
    if (!window._pendingDeleteDeckId) return;
    const id = window._pendingDeleteDeckId;
    closeConfirmModal();
    try {
      await fetch('/api/saved-decks/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + window.authToken } });
      if (typeof showToast === 'function') showToast('Deleted', 'Deck removed.', 'success');
      loadMyDecks();
    } catch {
      if (typeof showToast === 'function') showToast('Error', 'Delete failed.', 'error');
    }
  });
})();
function closeConfirmModal() {
  document.getElementById('confirmOverlay').classList.remove('visible');
  window._pendingDeleteDeckId = null;
}

window.deleteSavedDeck = function(id) {
  window._pendingDeleteDeckId = id;
  document.getElementById('confirmOverlay').classList.add('visible');
};

// ========================================
// localStorage progress persistence
// ========================================
window.saveProgress = function() {
  try {
    localStorage.setItem('rb_progress', JSON.stringify({
      legendId: selectedLegendData?.id,
      championId: selectedChampionData?.id,
      sb: window.sideboardCards.map(c => c.id),
    }));
  } catch {}
};

// Hook into existing functions to auto-save progress and update deck name
const _origAddCard = window.addCard;
if (_origAddCard) {
  window.addCard = async function(cardId, el) {
    await _origAddCard(cardId, el);
    saveProgress();
  };
}

const _origSelectChampion = window.selectChampion;
if (_origSelectChampion) {
  window.selectChampion = async function(championId, el) {
    const prevChampName = selectedChampionData?.name;
    await _origSelectChampion(championId, el);
    // Update deck name if user hasn't manually edited it
    // (deckName is empty = never manually set, OR deckName matches previous champion)
    if (selectedChampionData?.name) {
      if (!window.deckName || window.deckName === prevChampName || window.deckName === 'Untitled Deck') {
        setDeckName(selectedChampionData.name);
      }
    }
    injectDeckTitle(); // Ensure title element is up to date
    saveProgress();
  };
}

const _origSelectLegend = window.selectLegend;
if (_origSelectLegend) {
  window.selectLegend = async function(legendId, el) {
    await _origSelectLegend(legendId, el);
    saveProgress();
  };
}

// ========================================
// Change Champion
// ========================================
window.changeChampion = function() {
  if (!selectedLegendData) return;
  // Re-fetch champions and show overlay
  fetch('/api/deck/' + sessionId + '/legend', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ legendId: selectedLegendData.id })
  }).then(r => r.json()).then(data => {
    if (data.champions) {
      renderChampionOverlay(data.champions, data.domainIdentity || []);
      document.getElementById('championOverlay').classList.remove('hidden');
    }
  }).catch(() => {});
};

// ========================================
// Init auth on load
// ========================================
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => checkAuth(), 500);
});
