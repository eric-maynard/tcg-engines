/**
 * Ruling 8643042fd993e906 — Sett, Brawler (OGN-164 → ogn-164-298) · Champion Unit · Body · 5 · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × The Boss (OGN-269 → ogn-269-298) · Legend · "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead. When you conquer, ready me."
 *
 * Q: The Boss's replacement recalls a buffed Sett out of a combat that then ends in a conquer — does The Boss ready,
 *    and does Sett get a fresh buff?
 * A: The Boss readies (its own "When you conquer" trigger); Sett does NOT rebuff — he was not at the battlefield when it
 *    was conquered, so his "when I conquer" never triggers.
 * Rules: 371–372 (optional costed replacement), 467 (Conquer; the conquering units are those AT the battlefield),
 *        383.2.c (trigger conditions evaluated at the event), 702 (Buff).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1 (The Boss, exactly 1 rainbow power) attacks P2's bf1 (Wall, 5) with buffed Sett (4+1) and Pal (6).
 * P2 will put all 5 of Wall's damage on Sett (lethal); 11 into Wall kills it → Pal conquers.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .legend(P1, THE_BOSS, "boss")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", SETT, "sett", { buffed: true })
    .unit(P1, "base", { might: 6, name: "Pal" }, "pal");
}

/** Attack, both pass focus, P2 assigns lethal to Sett; stops at The Boss's opt-in. */
async function settAboutToDie(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  expect(game.state("boss").isExhausted).toBe(false);
  await game.p1.move(["sett", "pal"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const dist = game.decision();
  expect(dist).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
  await game.p2.distribute({ pal: 0, sett: 5 });
  return game;
}

describe("Ruling 8643042fd993e906 — The Boss recalls buffed Sett mid-combat; the conquer readies The Boss but does not rebuff Sett", () => {
  test("Sett taking lethal combat damage asks P1 The Boss's optional replacement (pay [rainbow] + exhaust the legend)", async () => {
    const game = await settAboutToDie();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
  });

  test("accepting: Sett's buff is spent, he is healed, exhausted and recalled to base (not dead); the legend is exhausted and the rainbow paid; Wall dies and Pal conquers bf1 — which puts The Boss's 'When you conquer, ready me' on the chain and NO Sett trigger", async () => {
    const game = await settAboutToDie();
    await game.p1.yes();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("boss").isExhausted).toBe(true); // paid as the replacement's cost, not yet readied
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // Only The Boss's conquer trigger — Sett was in base at the moment of conquering.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "boss", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "sett")).toBe(false);
  });

  test("after the chain resolves: The Boss is READY again, and Sett sits in base exhausted with NO new buff", async () => {
    const game = await settAboutToDie();
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isExhausted: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — declining The Boss: Sett dies; Pal still conquers and The Boss's ready trigger still fires (Sett, dead, gets nothing)", async () => {
    const game = await settAboutToDie();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });
});
