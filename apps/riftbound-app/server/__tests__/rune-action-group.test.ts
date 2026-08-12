/**
 * The Rune Actions group in the sidebar (public/js/gameplay/render/actions.js
 * `renderActions`) collapses by DISTINCT OPTION, not by move count.
 *
 * Two identical ready Chaos Runes are two `exhaustRune` moves but one choice:
 * the panel used to render a header button whose only job was to expand a
 * submenu holding a single indented child, so the first click looked dead
 * (nothing about the game state changed). One option = one direct-execute
 * button.
 *
 * The browser script is evaluated in a sandbox with stub globals (no DOM
 * library): `document` is a param and the mutable game globals live on
 * globalThis.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface Api {
  renderActions(): void;
}

const list = { innerHTML: "", querySelectorAll: () => [] as unknown[] };

function loadActions(): Api {
  const src = readFileSync(
    path.resolve(import.meta.dir, "../../public/js/gameplay/render/actions.js"),
    "utf8",
  );
  const mod: { exports?: Api } = { exports: {} as Api };
  const doc = {
    readyState: "complete",
    addEventListener() {},
    getElementById: (id: string) => (id === "actionsList" ? list : null),
    querySelectorAll: () => [] as unknown[],
  };
  const fn = new Function("module", "document", `${src}\nreturn module.exports;`);
  return fn(mod, doc) as Api;
}

const API = loadActions();
const g = globalThis as unknown as Record<string, unknown>;

function render(moves: unknown[], cards: Record<string, unknown>): string {
  g.availableMoves = moves;
  g.gameState = { turn: { activePlayer: "player1", phase: "main" }, interaction: {} };
  g.viewingPlayer = "player1";
  g.interaction = {};
  g.esc = (s: unknown) => String(s ?? "");
  g.findCard = (id: string) => cards[id];
  list.innerHTML = "";
  API.renderActions();
  return list.innerHTML;
}

const readyChaos = (id: string) => ({ id, domain: "chaos", meta: { exhausted: false } });
const exhaust = (runeId: string) => ({
  moveId: "exhaustRune",
  params: { runeId },
  playerId: "player1",
});

describe("Rune Actions group collapses by distinct option", () => {
  test("two interchangeable ready Chaos Runes render ONE direct-execute button, not a submenu toggle", () => {
    const html = render([exhaust("r7"), exhaust("r10")], {
      r7: readyChaos("r7"),
      r10: readyChaos("r10"),
    });
    expect(html).not.toContain("toggleMoveGroup('exhaustRune')");
    expect(html).toContain("executeMove(\"exhaustRune\"");
    // the count is still shown so the player knows a second rune remains
    expect(html).toContain("2 available");
  });

  test("two DIFFERENT domains still group behind a toggle — the choice is real", () => {
    const html = render([exhaust("r7"), exhaust("o1")], {
      r7: readyChaos("r7"),
      o1: { id: "o1", domain: "order", meta: { exhausted: false } },
    });
    expect(html).toContain("toggleMoveGroup('exhaustRune')");
  });

  test("a lone rune is unchanged: one direct-execute button", () => {
    const html = render([exhaust("r7")], { r7: readyChaos("r7") });
    expect(html).not.toContain("toggleMoveGroup('exhaustRune')");
    expect(html).toContain("executeMove(\"exhaustRune\"");
  });
});
