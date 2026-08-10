/**
 * Ruling c27d01e2c9417189 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might · "[Tank] When you play me to a battlefield, you may move an enemy unit to
 *     here. …"
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend
 *     its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Blitzcrank's grab targets my buffed unit; I respond with Hidden Blade to kill it and The Boss saves it (recalled to base). Is it
 *    still a legal target for Blitzcrank?
 * A: Yes. You save the unit and draw 2 off Hidden Blade, but Blitzcrank's move has no location requirement, so it still pulls the unit
 *    — now from your base and without its buff — to fight Blitzcrank.
 * Rules: 340 (LIFO), 366–372 (die replacement: same object, recalled — not a zone change), 359.3.e.9 (target legality re-checked on
 *        resolution: still an enemy unit), Blitzcrank has no "at a battlefield" restriction.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const BLITZCRANK = "ogn-067-298";
const THE_BOSS = "ogn-269-298";

/**
 * P2's turn 3 with 5+[calm] for Blitzcrank. P2 holds bf1 (Anchor 2). P1 (legend The Boss, ready; 1 Power for its [rainbow]) holds bf2
 * with a BUFFED Brawler (3+1) and a Sentry (2), and has Hidden Blade face down at bf2. Known P1 deck top d1, d2, d3.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .resources(P1, { power: { body: 1 } })
    .legend(P1, THE_BOSS, "boss")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "bf2", { might: 3, name: "Brawler" }, "brawler", { buffed: true })
    .unit(P1, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .facedown(P1, "bf2", HIDDEN_BLADE, "blade")
    .hand(P2, BLITZCRANK, "blitz")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P2 plays Blitzcrank to bf1 and aims the grab at the Brawler; P1 answers with the face-down Hidden Blade on the Brawler. */
async function grabThenBlade(): Promise<Game> {
  const game = await board().build();
  expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p2.play("blitz", { to: "bf1" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "blitz" } });
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "blitz" } });
  await game.p2.pick("brawler");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P2, targets: ["brawler"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade", { answers: ["brawler"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("brawler");
  }
  expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
    ["blitz", ["brawler"]],
    ["blade", ["brawler"]],
  ]);
  return game;
}

/** …both pass → Hidden Blade resolves; P1 accepts The Boss. Returns with Blitzcrank's item still on the chain. */
async function bladeResolvesBossSaves(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  await game.p1.yes();
}

describe("Ruling c27d01e2c9417189 — a Boss-saved unit is still grabbed by Blitzcrank (from base, buff gone)", () => {
  test("Hidden Blade resolves first: the Boss replaces the death — Brawler healed, exhausted, buff spent, RECALLED TO BASE — and P1 (its controller) draws 2; Blitzcrank's item still targets it", async () => {
    const game = await grabThenBlade();
    await bladeResolvesBossSaves(game);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["brawler"] })]);
  });

  test("Blitzcrank's grab then resolves and is still legal — no location restriction — so the Brawler is pulled from P1's BASE to bf1", async () => {
    const game = await grabThenBlade();
    await bladeResolvesBossSaves(game);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1");
    expect(game.state("brawler")).toMatchObject({ isBuffed: false, might: 3 }); // it arrives without its buff
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // a fight at Blitzcrank's battlefield
  });

  test("…and it fights Blitzcrank there without the buff: 3 into Tank 5 (+ Anchor) — the Brawler dies, P2 keeps bf1; P1 kept the 2 cards", async () => {
    const game = await grabThenBlade();
    await bladeResolvesBossSaves(game);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining The Boss — the Brawler really dies to the Blade (P1 still draws 2) and Blitzcrank's grab then has nothing to move", async () => {
    const game = await grabThenBlade();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.no();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.cardsAt("bf1").toSorted()).toEqual(["anchor", "blitz"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
