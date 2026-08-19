// Pre-passing priority / focus.
//
// [rule:ui-prepass-single-shot] You often know you have no response BEFORE the
// engine asks you. When the opponent's trigger goes on the chain and they are
// still deciding whether to react to their own item, the pass you are going to
// make is already decided — but the UI can only take it once priority actually
// arrives, so you sit and wait to press a button whose answer you knew.
//
// Arming a pre-pass records that intent. The moment a pass becomes legal for
// this seat it fires, once, and disarms.
//
// WHAT IT DELIBERATELY WILL NOT DO: it never passes through something new. If
// the chain GREW since you armed it — anyone added an item you have not seen —
// the pre-pass cancels and you get the prompt normally. Passing is only safe to
// automate for the situation you actually looked at, and "they responded with
// something" is exactly the case where a player wants to look again.

let _prepass = { armed: false, chainLen: 0, note: "" };

/** Chain length now — the "did something new appear" signal. */
function _prepassChainLen() {
  const s = typeof gameState !== "undefined" ? gameState : null;
  const chain = s?.chain ?? s?.chainItems ?? s?.theChain ?? null;
  return Array.isArray(chain) ? chain.length : 0;
}

/** The pass this seat could make right now, if any. */
function _prepassMove() {
  const moves = typeof availableMoves !== "undefined" ? availableMoves : [];
  return moves.find(
    (m) => m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus",
  );
}

/** True when a pre-pass is queued (the action bar and hotkey both read this). */
function isPrepassArmed() {
  return _prepass.armed;
}

function disarmPrepass(reason) {
  if (!_prepass.armed) return;
  _prepass = { armed: false, chainLen: 0, note: "" };
  if (reason && typeof showToast === "function") showToast(reason);
  if (typeof renderActions === "function") renderActions();
}

/**
 * Arm (or cancel) a pre-pass. Called by the same control that passes, so one
 * key does the obvious thing in both states: pass now if you can, otherwise
 * queue it.
 */
function togglePrepass() {
  if (_prepass.armed) {
    disarmPrepass("Pre-pass cancelled");
    return;
  }
  const now = _prepassMove();
  if (now) {
    // Priority is already here — just pass; queuing would be a strange detour.
    executeMove(now.moveId, now.params, now.playerId);
    return;
  }
  _prepass = { armed: true, chainLen: _prepassChainLen(), note: "" };
  if (typeof showToast === "function") {
    showToast("Pre-pass queued — will pass when priority reaches you");
  }
  if (typeof renderActions === "function") renderActions();
}

/**
 * The whole policy, as a pure function so it can be tested without a board.
 *
 *   "fire"   — priority is here and nothing new appeared: pass now.
 *   "cancel" — the chain grew, or the game ended: hand control back.
 *   "wait"   — not our turn to act yet.
 */
function prepassDecide({ armed, over, chainLenAtArm, chainLenNow, hasPassMove }) {
  if (!armed) return "wait";
  if (over) return "cancel";
  // Something new went on the chain: the player has not seen it, so stop.
  if (chainLenNow > chainLenAtArm) return "cancel";
  return hasPassMove ? "fire" : "wait";
}

/**
 * Called after every state frame. Fires the queued pass, or cancels it when
 * the situation changed under it.
 */
function maybeFirePrepass() {
  if (!_prepass.armed) return;
  const state = typeof gameState !== "undefined" ? gameState : null;
  const move = _prepassMove();
  const decision = prepassDecide({
    armed: _prepass.armed,
    chainLenAtArm: _prepass.chainLen,
    chainLenNow: _prepassChainLen(),
    hasPassMove: Boolean(move),
    over: !state || Boolean(state.winner),
  });
  if (decision === "cancel") {
    disarmPrepass(
      !state || state.winner ? "" : "Pre-pass cancelled — the chain changed",
    );
    return;
  }
  if (decision !== "fire" || !move) return;
  _prepass = { armed: false, chainLen: 0, note: "" };
  executeMove(move.moveId, move.params, move.playerId);
}

/** Any deliberate action by this seat means they are engaged — drop the queue. */
function prepassOnPlayerAction(moveId) {
  if (!_prepass.armed) return;
  if (moveId === "passChainPriority" || moveId === "passShowdownFocus") return;
  disarmPrepass("Pre-pass cancelled — you acted");
}


// ---------------------------------------------------------------------------
// Auto-pass on a window with nothing real to do
// ---------------------------------------------------------------------------
//
// [rule:ui-autopass-no-real-action] Priority comes to you constantly — every
// trigger, every chain item, every showdown step — and most of those windows
// offer nothing but "pass". Clicking through them is the single most repetitive
// thing in a game against the AI or a goldfish, and it teaches nothing.
//
// "Nothing real" is deliberately NOT "no legal moves". Tapping a rune is legal
// at almost every window and is never, on its own, a reason to hold priority:
// it produces energy for a play you have not got. So resource plumbing does not
// count as a real action, and neither does the pass itself, conceding, or
// re-ordering what you already hold.
//
// Anything that changes the game — a card, an ability, a move, a combat step, a
// choice — DOES count, and the moment one is available this stops firing and
// hands the window back.

/** Moves that are never, by themselves, a reason to keep priority. */
const AUTOPASS_TRIVIAL_MOVES = new Set([
  // Resource plumbing: energy you have not spent on anything yet.
  "exhaustRune",
  "recycleRune",
  "addResources",
  "spendResources",
  "channelRunes",
  "emptyRunePool",
  // The pass itself, and the ways out of the game.
  "pass",
  "passChainPriority",
  "passShowdownFocus",
  "concede",
]);

/**
 * Is there a move here worth stopping for?
 *
 * Pure so the classification is testable without a board — the whole risk of
 * this feature is passing through a window the player wanted.
 */
function hasRealAction(moves) {
  return (moves || []).some((m) => !AUTOPASS_TRIVIAL_MOVES.has(m && m.moveId));
}

/**
 * Should this window be passed automatically?
 *
 *   enabled     — the player's toggle
 *   hasPass     — a pass is legal right now (otherwise there is nothing to do)
 *   moves       — the enumerated menu
 *   pendingChoice — a prompt the engine is blocking on: NEVER auto-answered,
 *                   even when the only listed move is the pass, because a
 *                   prompt is a question addressed to the player.
 */
function autopassDecide({ enabled, hasPass, moves, pendingChoice }) {
  if (!enabled || !hasPass) return false;
  if (pendingChoice) return false;
  return !hasRealAction(moves);
}

/** Default ON against Claude and the goldfish, OFF against a person. */
function autopassDefaultForOpponent(opponentKind) {
  return opponentKind === "claude" || opponentKind === "goldfish";
}

let _autopass = { enabled: null };

function autopassEnabled() {
  if (_autopass.enabled !== null) return _autopass.enabled;
  const kind =
    typeof aiOpponentInfo !== "undefined" && aiOpponentInfo
      ? aiOpponentInfo.kind
      : typeof gameState !== "undefined" && gameState?.ai
        ? gameState.ai.kind
        : null;
  return autopassDefaultForOpponent(kind);
}

/** The settings toggle flips this; null means "follow the opponent default". */
function setAutopassEnabled(on) {
  _autopass.enabled = on;
  if (typeof renderActions === "function") renderActions();
}

/**
 * Called after every state frame, after the pre-pass hook. Passes a window that
 * offers nothing real.
 */
function maybeAutopass() {
  if (typeof availableMoves === "undefined") return;
  const passMove = (availableMoves || []).find(
    (m) => m.moveId === "passChainPriority" || m.moveId === "passShowdownFocus",
  );
  const decision = autopassDecide({
    enabled: autopassEnabled(),
    hasPass: Boolean(passMove),
    moves: availableMoves,
    pendingChoice:
      typeof gameState !== "undefined" ? Boolean(gameState?.pendingChoice) : false,
  });
  if (!decision || !passMove) return;
  executeMove(passMove.moveId, passMove.params, passMove.playerId);
}
