/**
 * Ruling 6941dd8ae9e5d71d — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] [2][order] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: During a showdown at one battlefield, can I react with a card like Gust to remove a unit at a DIFFERENT battlefield?
 * A: Yes — a spell from hand may target any legal unit anywhere; the "here" targeting restriction applies only to cards played
 *    from Hidden (a Hidden Blade facedown at the showdown's battlefield can only pick a unit there, not at the other one).
 * Rules: 341/345 (Reactions during a showdown), 355 (targeting), 811.1.d.2 (a hidden card's choices are restricted to "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * Turn 3, P2's turn. bfA: P2's, with P2's 2-Might Scout. bfB: P1's, with P1's 2-Might Sentinel and P1's Hidden Blade facedown
 * (hidden earlier). P2's 4-Might Raider attacks bfB → the showdown is at B. P1 holds Gust with [1].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P2, "bfA", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bfB", { might: 2, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bfB", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, GUST, "gust");
}

/** Raider attacks bfB; P2 (attacker) passes Focus; P1 now acts in the showdown at B. */
async function showdownAtB(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfB");
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB" });
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

const targetsOf = (game: Game, verb: string, card: string) =>
  [...new Set((game.p1.option(verb, card)?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[])];

describe("Ruling 6941dd8ae9e5d71d — from hand you may hit the OTHER battlefield during a showdown; only hidden cards are pinned to 'here'", () => {
  test("Gust from hand during the showdown at B offers the Scout at bfA (and the Sentinel at B) — targeting is not limited to the showdown's battlefield", async () => {
    const game = await showdownAtB();
    expect(game.p1.can("cast", "gust")).toBe(true);
    const offered = targetsOf(game, "cast", "gust");
    expect(offered).toContain("scout"); // at bfA — the other battlefield
    expect(offered).toContain("sentinel"); // at bfB
    expect(offered).not.toContain("raider"); // 4 Might — over Gust's limit, wherever it is
  });

  test("…and it works: Gust returns the Scout at bfA to P2's hand while the showdown at B carries on", async () => {
    const game = await showdownAtB();
    await game.p1.cast("gust", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the Hidden Blade facedown AT B, played in that same window, may only choose a unit at B (Raider / Sentinel) — the Scout at bfA is not offered and is refused", async () => {
    const game = await showdownAtB();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    const forced = await game.p1.try((p) => p.reveal("blade", { targets: "scout" }));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bfB");
    // Played from hidden for [0]; its target is asked as it is finalized — only units HERE are offered.
    await game.p1.reveal("blade");
    expect(game.p1.energy()).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "blade" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card as string).sort() : [];
    expect(offered).toEqual(["raider", "sentinel"]);
    expect(offered).not.toContain("scout");
    const r = await game.p1.try((p) => p.pick("scout"));
    expect(r.ok).toBe(false);
    // Legal use: kill the attacking Raider here.
    await game.p1.pick("raider");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });
});
