/**
 * Ruling 61cdf29e5cf89ed7 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *   × The Boss (Sett legend, ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and
 *     spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Can an opponent react to Sett's Legend ability (recalling a buffed unit that would die in a showdown) with Gust?
 * A: No. It is a replacement effect — it does not use the chain and cannot be reacted to; the unit is recalled as part
 *    of the death event itself.
 * Rules: 371–372 (replacement effects apply as the event happens, no chain item), 383.3 (contrast: triggers use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const GUST = "ogn-169-298";

/**
 * P1's turn with The Boss (ready) and 1 spare [body] for its [rainbow]. P1's Brawler (printed 2, BUFFED → 3) attacks
 * P2's bf1 held by a 5-Might Wall. P2 holds Gust with [1] — the Brawler (3 Might, at a battlefield) would be a legal
 * Gust target if P2 ever got a window.
 */
function board() {
  return scenario()
    .resources(P1, { power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .legend(P1, THE_BOSS, "boss")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Brawler" }, "brawler", { buffed: true })
    .hand(P2, GUST, "gust");
}

/** Brawler attacks; both pass through the showdown until The Boss's replacement asks P1. */
async function attackUntilBossAsks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p1.move("brawler", "bf1");
  // P2 declines to Gust during the showdown itself (the question is about reacting to the LEGEND ability).
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain") && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 61cdf29e5cf89ed7 — The Boss's save is a replacement effect: no chain item, no Gust window", () => {
  test("when combat damage would kill the buffed Brawler, P1 is asked The Boss's optional replacement (yes/no from the legend) — with NOTHING on the chain and no action window for P2", async () => {
    const game = await attackUntilBossAsks();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1"); // not dead, not yet recalled
    // P2 has no say right now: not P2's decision, no cast option, a forced Gust is rejected.
    expect(game.p2.decision()?.kind === "action").toBe(false);
    expect(game.p2.can("cast", "gust")).toBe(false);
    const r = await game.p2.try((p) => p.cast("gust", { targets: "brawler" }));
    expect(r.ok).toBe(false);
  });

  test("YES: the Brawler is healed, un-buffed, exhausted and recalled to base INSTEAD of dying — immediately, still with no chain item; The Boss is exhausted and [rainbow] paid", async () => {
    const game = await attackUntilBossAsks();
    await game.p1.yes();
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
  });

  test("P2 never gets to Gust the Brawler off the battlefield in between: by the time P2 may act again the Brawler is already in base (not 'at a battlefield') and Gust has no target", async () => {
    const game = await attackUntilBossAsks();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Even on P2's own priority later, the Brawler in base is not a Gust target.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
