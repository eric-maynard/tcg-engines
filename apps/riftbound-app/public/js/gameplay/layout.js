/* ============================================================
   Workstream 6 — Proportional scale-to-fit layout
   ============================================================
   The game board is authored against a fixed 1920x1080 logical
   coordinate space inside #game-scale-wrapper. On resize we
   compute scale = min(windowWidth / 1920, windowHeight / 1080)
   and apply it via CSS transform so the whole board scales
   uniformly with no reflow. Below a minimum scale of 0.5 we
   show a "please resize" banner instead of an unreadable board.
   ============================================================ */
(function () {
  var LOGICAL_WIDTH = 1920;
  var LOGICAL_HEIGHT = 1080;
  var MIN_SCALE = 0.5;
  // Reserve vertical space for the top-header bar (matches
  // `.app { height: calc(100vh - 40px) }` in gameplay.css).
  var HEADER_H = 40;

  var wrapper = null;
  var banner = null;
  var resizeObserver = null;

  function applyScale() {
    if (!wrapper) {
      wrapper = document.getElementById("game-scale-wrapper");
    }
    if (!banner) {
      banner = document.getElementById("scale-resize-banner");
    }
    if (!wrapper) return;

    var w = window.innerWidth;
    var h = Math.max(0, window.innerHeight - HEADER_H);
    var scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);

    if (scale < MIN_SCALE) {
      wrapper.style.visibility = "hidden";
      if (banner) banner.classList.remove("hidden");
      return;
    }

    if (banner) banner.classList.add("hidden");
    wrapper.style.visibility = "visible";

    // The wrapper is absolute-positioned with translate(-50%, -50%) for
    // centering. Preserve that translate and append the scale so the
    // board stays centered inside .app while scaling from its center.
    wrapper.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
  }

  function init() {
    wrapper = document.getElementById("game-scale-wrapper");
    banner = document.getElementById("scale-resize-banner");
    if (!wrapper) return;

    applyScale();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(function () {
        applyScale();
      });
      resizeObserver.observe(document.body);
    }

    // Listen for window resize as a fallback — ResizeObserver on body
    // can miss certain viewport-only changes (e.g. devtools docking).
    window.addEventListener("resize", applyScale);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
