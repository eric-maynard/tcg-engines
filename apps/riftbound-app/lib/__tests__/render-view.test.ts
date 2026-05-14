/**
 * Render-view tests — strings, not pixels. We check the HTML output contains
 * the expected pieces of the view (turn number, player ids, etc.).
 */

import { describe, expect, test } from "bun:test";
import { BotDriver } from "../bot-driver";
import { EngineSession } from "../engine-session";
import { renderPageHtml, renderTrailHtml, renderViewHtml } from "../render-view";

describe("renderViewHtml", () => {
  test("includes turn number, active player, and battlefield ids", () => {
    const session = new EngineSession({ seed: "rv-1" });
    const view = session.getView();
    const html = renderViewHtml(view);
    expect(html).toContain("Turn 1");
    expect(html).toContain("player-1");
    expect(html).toContain("player-2");
    expect(html).toContain("Battlefields");
    for (const bf of view.battlefields) {
      expect(html).toContain(bf.id);
    }
  });

  test("escapes special characters in player ids", () => {
    const session = new EngineSession({
      playerIds: ["<p1>", "<p2>"],
      seed: "rv-esc",
    });
    const html = renderViewHtml(session.getView());
    expect(html).toContain("&lt;p1&gt;");
    expect(html).toContain("&lt;p2&gt;");
    // Raw `<p1>` should never appear unescaped inside text.
    expect(html).not.toContain(">&lt;p1>");
  });

  test("phaseStrip marks the current phase active", () => {
    const session = new EngineSession({ seed: "rv-phase" });
    const html = renderViewHtml(session.getView());
    expect(html).toContain("phase-active");
  });

  test("shows winner banner when game is finished", () => {
    const session = new EngineSession({ seed: "rv-winner" });
    // Force-end via concede so we get a winner deterministically.
    const beforeStatus = session.getView().status;
    expect(beforeStatus).toBe("playing");
    const step = session.applyMove("player-2", {
      moveId: "concede",
      params: { playerId: "player-2" },
    });
    expect(step.success).toBe(true);
    const html = renderViewHtml(session.getView());
    if (session.getView().status === "finished") {
      expect(html).toContain("Winner:");
    }
  });
});

describe("renderTrailHtml", () => {
  test("renders one <li> per step", () => {
    const session = new EngineSession({ seed: "rt" });
    const bot = new BotDriver("player-1");
    bot.step(session);
    bot.step(session);
    const trail = session.getTrail();
    const html = renderTrailHtml(trail);
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(trail.length);
  });

  test("marks failed steps with step-fail class", () => {
    const session = new EngineSession({ seed: "rt-fail" });
    // P2 isn't active — this should fail
    session.applyMove("player-2", {
      moveId: "endTurn",
      params: { playerId: "player-2" },
    });
    const html = renderTrailHtml(session.getTrail());
    expect(html).toContain("step-fail");
  });
});

describe("renderPageHtml", () => {
  test("produces a full HTML document", () => {
    const session = new EngineSession({ seed: "rp" });
    const html = renderPageHtml({
      title: "Test page",
      trail: session.getTrail(),
      view: session.getView(),
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Test page</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("</html>");
  });
});
