// chat.js — M8: multiplayer chat panel.
//
// This is a thin presentational layer. No engine/game logic lives here:
// chat is purely a player-to-player side channel. In sandbox/goldfish there is
// no opponent, so the panel renders a disabled placeholder. In a real room it
// echoes the local player's messages and (best-effort) forwards them over the
// existing game WebSocket as a `chat` message; incoming `chat` messages from
// websocket.js are appended via `appendChatMessage`.

(function () {
  "use strict";

  function isSandbox() {
    try {
      if (typeof isSandboxGame !== "undefined" && isSandboxGame) return true;
      if (typeof gameState !== "undefined" && gameState && gameState.isSandbox) return true;
    } catch (_e) { /* ignore */ }
    return false;
  }

  function displayName(id) {
    try {
      if (typeof pName === "function") return pName(id);
      if (typeof getPlayerName === "function") return getPlayerName(id);
    } catch (_e) { /* ignore */ }
    return id || "Player";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /** Append a chat line. `who` may be a player id, "system", or a display name. */
  window.appendChatMessage = function appendChatMessage(who, text, opts) {
    const box = document.getElementById("chatMessages");
    if (!box) return;
    const o = opts || {};
    const line = document.createElement("div");
    line.className = "chat-msg" + (o.system ? " chat-msg-system" : "") + (o.self ? " chat-msg-self" : "");
    const ts = new Date();
    const hh = String(ts.getHours()).padStart(2, "0");
    const mm = String(ts.getMinutes()).padStart(2, "0");
    if (o.system) {
      line.innerHTML = `<span class="chat-msg-text">${escapeHtml(text)}</span>`;
    } else {
      const name = o.name || displayName(who);
      line.innerHTML =
        `<span class="chat-msg-time">${hh}:${mm}</span>` +
        `<span class="chat-msg-who">${escapeHtml(name)}</span>` +
        `<span class="chat-msg-text">${escapeHtml(text)}</span>`;
    }
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  };

  /** Form submit handler — referenced from gameplay.html. */
  window.sendChatMessage = function sendChatMessage(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const input = document.getElementById("chatInput");
    if (!input) return false;
    const text = (input.value || "").trim();
    if (!text) return false;
    input.value = "";

    if (isSandbox()) {
      // No opponent to talk to — make it obvious this is a stub.
      window.appendChatMessage("system", "Chat is available in multiplayer rooms.", { system: true });
      return false;
    }

    const myId = (typeof viewingPlayer !== "undefined" && viewingPlayer) ? viewingPlayer : null;
    const myName = myId ? displayName(myId) : "You";
    window.appendChatMessage(myId, text, { self: true, name: myName });

    // Best-effort forward over the game socket. If the server doesn't yet
    // understand `chat` it will simply ignore it; no crash.
    try {
      if (typeof ws !== "undefined" && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "chat", text, from: myId, name: myName }));
      }
    } catch (_e) { /* ignore */ }
    return false;
  };

  /** Show/hide + enable/disable the panel based on game mode. Called on render. */
  window.refreshChatPanel = function refreshChatPanel() {
    const panel = document.getElementById("chatPanel");
    if (!panel) return;
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    const sandbox = isSandbox();
    panel.classList.toggle("chat-disabled", sandbox);
    if (input) {
      input.disabled = false; // keep typeable so the stub message can fire
      input.placeholder = sandbox ? "Multiplayer only…" : "Type message…";
    }
    if (btn) btn.disabled = false;
    if (sandbox && !panel.dataset.stubNoted) {
      panel.dataset.stubNoted = "1";
      window.appendChatMessage("system", "Solo practice — no opponent to chat with.", { system: true });
    }
  };

  // Wire into the render loop if renderer.js exposes a hook; otherwise the
  // panel still works on its own (it's just static DOM).
  document.addEventListener("DOMContentLoaded", () => {
    try { window.refreshChatPanel(); } catch (_e) { /* ignore */ }
  });
})();
