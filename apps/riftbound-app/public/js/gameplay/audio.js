// audio.js — Audio and ping system

/** Play a chime sound using Web Audio API */
function playPingChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Two-tone chime: ascending notes
    [0, 0.15].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1174.66; // A5 → D6
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch { /* Audio not available */ }
}

/** Send a ping for a card, zone, or battlefield */
function sendPing(target, targetType) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "game_ping",
    target,
    targetType,
  }));
}

/** Handle an incoming ping — highlight the element and play chime */
function handlePing(msg) {
  playPingChime();

  const { target, targetType, playerId: pinger } = msg;
  const label = pName(pinger);

  let el = null;

  if (targetType === "card") {
    el = document.querySelector(`[data-card-id="${CSS.escape(target)}"]`);
  } else if (targetType === "battlefield") {
    el = document.querySelector(`[data-bf-id="${CSS.escape(target)}"]`);
  } else if (targetType === "zone") {
    el = document.getElementById(target);
  }

  if (!el) return;

  // Add ping animation class
  el.classList.add("pinged");

  // Add expanding ring
  const ring = document.createElement("div");
  ring.className = "ping-ring";
  el.style.position = el.style.position || "relative";
  el.appendChild(ring);

  // Add label
  const labelEl = document.createElement("div");
  labelEl.className = "ping-label";
  labelEl.textContent = `${label} pinged`;
  el.appendChild(labelEl);

  // Clean up after animation
  setTimeout(() => {
    el.classList.remove("pinged");
    ring.remove();
    labelEl.remove();
  }, 2400);
}

/** Right-click on a card to ping it, or recycle a rune */
document.addEventListener("contextmenu", (e) => {
  // Find closest pingable element
  const card = e.target.closest("[data-card-id]");
  const bf = e.target.closest("[data-bf-id]");

  if (card) {
    e.preventDefault();
    const cardId = card.dataset.cardId;
    const zone = card.dataset.zone;

    // Right-click on a rune = recycle it
    if (zone === "runePool") {
      const recycleMove = availableMoves.find(m =>
        m.moveId === "recycleRune" && (m.params?.runeId === cardId || m.params?.cardId === cardId)
      );
      if (recycleMove) {
        snapshotResources();
        executeMove(recycleMove.moveId, recycleMove.params, recycleMove.playerId);
      } else {
        showToast("Cannot recycle this rune");
      }
      return;
    }

    // Default: ping the card
    sendPing(cardId, "card");
  } else if (bf) {
    e.preventDefault();
    sendPing(bf.dataset.bfId, "battlefield");
  }
});
