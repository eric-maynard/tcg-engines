// help-modal.js — Hotkey help modal + onboarding hint
//
// Triggered by:
//   - The `?` key (handled by hotkeys.js)
//   - Clicking the `i` icon in the sidebar (wired via inline onclick in gameplay.html)
//
// Also renders a small onboarding hint next to the `i` button the first time a
// player loads the page. Dismissal is remembered in localStorage under
// `rba-onboarding-dismissed`.

const HELP_PRESS_KEYS = [
  { keys: ["Space"], action: "End your turn / pass chain priority" },
  { keys: ["D"], action: "Draw a card (main phase)" },
  { keys: ["R", "Backspace"], action: "Rewind the last action" },
  { keys: ["A"], action: "Approve the top effect on the chain" },
  { keys: ["S"], action: "Resolve the top effect on the chain" },
  { keys: ["Q"], action: "End showdown / conquer the battlefield" },
  { keys: ["W"], action: "Pass focus in the current showdown" },
  { keys: ["?"], action: "Open this help dialog" },
  { keys: ["Esc"], action: "Cancel selection / close dialogs" },
];

const HELP_HOLD_KEYS = [
  { keys: ["C"], action: "Counter mode — click a card to apply a counter" },
  { keys: ["B"], action: "Buff mode — click a unit to apply a might buff" },
  { keys: ["T"], action: "Target mode — target for the top chain effect" },
  { keys: ["L"], action: "Open the label wheel on the hovered card" },
  { keys: ["E"], action: "Open the emote wheel" },
  { keys: ["P"], action: "Ping the hovered card for your opponent" },
];

let _helpModalOpen = false;

function isHelpModalOpen() {
  return _helpModalOpen;
}

function buildHelpModal() {
  const existing = document.getElementById("helpModal");
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = "helpModal";
  overlay.className = "help-modal-overlay";
  overlay.innerHTML = `
    <div class="help-modal-box" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle">
      <button class="help-modal-close" type="button" aria-label="Close" onclick="closeHelpModal()">&times;</button>
      <h2 id="helpModalTitle" class="help-modal-title">Keyboard Shortcuts</h2>
      <div class="help-modal-columns">
        <section class="help-col">
          <h3 class="help-col-title">Press</h3>
          <table class="help-table">
            <tbody>
              ${HELP_PRESS_KEYS.map(renderHelpRow).join("")}
            </tbody>
          </table>
        </section>
        <section class="help-col">
          <h3 class="help-col-title">Hold</h3>
          <p class="help-col-sub">Press and hold, then click a target.</p>
          <table class="help-table">
            <tbody>
              ${HELP_HOLD_KEYS.map(renderHelpRow).join("")}
            </tbody>
          </table>
        </section>
      </div>
      <div class="help-modal-footer">
        Press <kbd>?</kbd> any time to reopen, or <kbd>Esc</kbd> to close.
      </div>
    </div>
  `;

  // Clicking the backdrop closes the modal.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeHelpModal();
  });

  document.body.appendChild(overlay);
  return overlay;
}

function renderHelpRow(entry) {
  const keys = entry.keys.map(k => `<kbd>${escapeHelpText(k)}</kbd>`).join(" / ");
  return `<tr><td class="help-keys">${keys}</td><td class="help-action">${escapeHelpText(entry.action)}</td></tr>`;
}

function escapeHelpText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openHelpModal() {
  const modal = buildHelpModal();
  modal.classList.add("visible");
  _helpModalOpen = true;
  // Clicking the `i` button counts as "seen" — dismiss the onboarding hint.
  dismissOnboardingHint();
}

function closeHelpModal() {
  const modal = document.getElementById("helpModal");
  if (modal) modal.classList.remove("visible");
  _helpModalOpen = false;
}

function toggleHelpModal() {
  if (_helpModalOpen) closeHelpModal();
  else openHelpModal();
}

// ---- Onboarding hint --------------------------------------------------------

const ONBOARDING_KEY = "rba-onboarding-dismissed";

function shouldShowOnboardingHint() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== "1";
  } catch {
    return false;
  }
}

function dismissOnboardingHint() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
  const hint = document.getElementById("onboardingHint");
  if (hint) hint.remove();
}

function showOnboardingHintIfNeeded() {
  if (!shouldShowOnboardingHint()) return;
  // The `i` button is rendered inside the sidebar, which is hidden until the
  // game is playing. Wait for it to appear before anchoring the hint.
  const anchor = document.getElementById("helpInfoBtn");
  if (!anchor) return;
  if (document.getElementById("onboardingHint")) return;

  const hint = document.createElement("div");
  hint.id = "onboardingHint";
  hint.className = "onboarding-hint";
  hint.innerHTML = `
    <span>First game? Tap the <strong>i</strong> for controls and board tips.</span>
    <button type="button" class="onboarding-hint-close" aria-label="Dismiss">&times;</button>
  `;
  hint.querySelector(".onboarding-hint-close").addEventListener("click", (e) => {
    e.stopPropagation();
    dismissOnboardingHint();
  });
  // Anchor next to the sidebar button.
  anchor.parentElement.appendChild(hint);
}

/** Poll lightly for the sidebar to appear so we can attach the hint. */
function initHelpModal() {
  // Ensure modal is prebuilt so `?` works instantly.
  buildHelpModal();

  // Retry showing the onboarding hint for ~10 seconds after load — the sidebar
  // only appears once the game starts, so we can't anchor immediately.
  let attempts = 0;
  const interval = setInterval(() => {
    attempts += 1;
    if (attempts > 20 || !shouldShowOnboardingHint()) {
      clearInterval(interval);
      return;
    }
    if (document.getElementById("helpInfoBtn")) {
      showOnboardingHintIfNeeded();
      clearInterval(interval);
    }
  }, 500);
}

// Expose globals.
window.isHelpModalOpen = isHelpModalOpen;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.toggleHelpModal = toggleHelpModal;
window.initHelpModal = initHelpModal;
window.dismissOnboardingHint = dismissOnboardingHint;
