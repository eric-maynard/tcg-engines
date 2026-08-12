/**
 * Interaction: Mosstomper (unl-047-219) mirror × Herald of Spring (unl-034-219) × Falling Star (ogn-029-298)
 *              — one XP pool PER PLAYER, also in a Duel.
 *
 *   Mosstomper — Unit · Calm · 3 · 3 Might
 *     "[Hunt 2] (When I conquer or hold, gain 2 XP.)  [Level 3][>] I have +1 [Might] and [Deflect]."
 *   Herald of Spring — Unit · Calm · 4 · 4 Might   "[Hunt] … When you play me, gain 2 XP."
 *   Falling Star — Spell · Fury · 2 + [fury][fury]  "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Rules: 732 (XP is not shared between Allies — a teams restatement of the invariant that XP is a per-player
 * total; 485.2: a Duel has no allies at all), 315.2.b + 469.2 + 471.2.b (Scoring Step: the turn player Holds
 * → point + Hold triggers such as [Hunt]), 824.1.c ([Level N] reads the CONTROLLER's XP), 809.1.c ([Deflect]:
 * only OPPONENTS pay, and only while the unit has it), 323.5 (lethal damage → dies at the next cleanup).
 *
 * Question. P1's Mosstomper alone at bfA (P1's), P2's Mosstomper at bfB (P2's), P2 holds Herald of Spring.
 * XP 1 / 1. (a) P1's turn begins and P1 holds bfA: XP totals? which Mosstomper is 4 Might + Deflect? P1 then
 * Falling-Stars P2's Mosstomper twice with no spare power — legal? dead? (b) Instead, on P2's turn P2 plays
 * Herald of Spring (P2 1→3) while P1 stays at 1: which one levels, and can P2 Falling-Star P1's Mosstomper
 * without paying Deflect?
 *
 * Expected. (a) P1 XP 3 (Hunt 2 on hold), P2 XP 1; only P1's Mosstomper is 4 + Deflect; P1's Falling Star on
 * P2's (Deflect-less) Mosstomper owes nothing extra → legal with exactly 2 + [fury][fury]; 6 ≥ 3 → dies.
 * Conversely P2 choosing P1's Mosstomper would owe [rainbow]. (b) P2 XP 3, P1 XP 1; only P2's Mosstomper
 * levels; P2's Falling Star on P1's Mosstomper needs no Deflect payment and kills it. Never does one player's
 * XP switch on the other's Level 3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOSSTOMPER = "unl-047-219";
const HERALD_OF_SPRING = "unl-034-219";
const FALLING_STAR = "ogn-029-298";

/**
 * End of P2's turn 2 (so `advanceTurn()` starts P1's turn 3 with the hold of bfA). XP 1 / 1.
 * bfA: P1's, P1's Mosstomper alone. bfB: P2's, P2's Mosstomper. Hands: a Falling Star each; P2 also Herald.
 * P2's pool covers Herald (4 + [calm]) plus Falling Star (2 + [fury][fury]) exactly — no [rainbow] anywhere.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .xp(P1, 1)
    .xp(P2, 1)
    .resources(P2, { energy: 6, power: { calm: 1, fury: 2 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", MOSSTOMPER, "moss1")
    .unit(P2, "bfB", MOSSTOMPER, "moss2")
    .hand(P1, FALLING_STAR, "star1")
    .hand(P2, FALLING_STAR, "star2")
    .hand(P2, HERALD_OF_SPRING, "herald");
}

const hasDeflect = (game: Game, unit: string) => game.state(unit).keywords.includes("Deflect");

/** Target tuples the seat's Falling Star is offered right now (each a [first, second] or [only] list of unit ids). */
function starTuples(game: Game, seat: "p1" | "p2", alias: string): string[][] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? [...v] : [v]) as string[]);
}

/** (a) P2 ends turn 2 → P1's turn 3: Scoring Step holds bfA. P1 is then given exactly Falling Star's cost. */
async function p1Holds(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  await game.p1.do("addResources", { energy: 2, power: { fury: 2 } });
  return game;
}

/** (b) Still P2's turn 2: P2 plays Herald of Spring to base and its play trigger resolves. */
async function p2PlaysHerald(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("herald", { to: "base" });
  await game.settle();
  expect(game.zoneOf("herald")).toBe("base");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return game;
}

describe("Mosstomper mirror — XP is one pool per player; Level 3 reads only its controller's pool", () => {
  test("premise: at XP 1 / 1 both Mosstompers are plain 3-Might units without Deflect", async () => {
    const game = await board().build();
    expect([game.p1.xp(), game.p2.xp()]).toEqual([1, 1]);
    expect(game.state("moss1")).toMatchObject({ baseMight: 3, might: 3 });
    expect(game.state("moss2")).toMatchObject({ baseMight: 3, might: 3 });
    expect(hasDeflect(game, "moss1")).toBe(false);
    expect(hasDeflect(game, "moss2")).toBe(false);
  });

  // ── (a) P1 holds bfA ──────────────────────────────────────────────────────────────────────

  test("(a) P1's turn begins and P1 HOLDS bfA: a point and [Hunt 2] for the controller — P1 XP 1→3; P2's pool is untouched at 1 (315.2.b, 471.2.b)", async () => {
    const game = await p1Holds();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1]).toContain("bfA");
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) only P1's Mosstomper levels up (4 Might + Deflect); P2's stays 3 with NO Deflect although the table holds 4 XP in total (824.1.c)", async () => {
    const game = await p1Holds();
    expect(game.state("moss1").might).toBe(4);
    expect(hasDeflect(game, "moss1")).toBe(true);
    expect(game.state("moss2").might).toBe(3);
    expect(hasDeflect(game, "moss2")).toBe(false);
    expect(game.p1.xp() + game.p2.xp()).toBe(4);
  });

  test("(a) P1's Falling Star putting both 3s into P2's Deflect-less Mosstomper owes no surcharge: offered and castable with exactly 2 + [fury][fury], pool → 0", async () => {
    const game = await p1Holds();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
    expect(starTuples(game, "p1", "star1")).toContainEqual(["moss2", "moss2"]);
    await game.p1.cast("star1", { targets: ["moss2", "moss2"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star1", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(a) 3 + 3 = 6 ≥ 3 is lethal: P2's Mosstomper dies at the next cleanup (323.5); P1's leveled one is untouched", async () => {
    const game = await p1Holds();
    await game.p1.cast("star1", { targets: ["moss2", "moss2"] });
    await game.settle();
    expect(game.zoneOf("moss2")).toBe("trash");
    expect(game.zoneOf("moss1")).toBe("battlefield-bfA");
    expect(game.state("moss1")).toMatchObject({ damage: 0, might: 4 });
    expect(game.zoneOf("star1")).toBe("trash");
    expect([game.p1.xp(), game.p2.xp()]).toEqual([3, 1]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) conversely P1's Mosstomper now HAS Deflect against P2: on P2's next turn, with 2 + [fury][fury] and no [rainbow], every Falling Star tuple naming moss1 is listed-but-unaffordable and a forced cast is rejected (809.1.c / 809.1.d)", async () => {
    const game = await p1Holds();
    await game.advanceTurn(); // → P2's turn 4 (P1 still has 3 XP; moss1 keeps Deflect)
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(3);
    expect(hasDeflect(game, "moss1")).toBe(true);
    await game.p2.do("addResources", { energy: 2, power: { fury: 2 } });
    const tuples = starTuples(game, "p2", "star2");
    expect(tuples).toContainEqual(["moss2", "moss2"]); // its own Mosstomper: Deflect never taxes the controller
    // rule 809.1.d — a taxed tuple a rune Add could still fund stays LISTED and dimmed; only the
    // cast is refused. P2 has runes here, so moss1's tuples are offered as unaffordable.
    const field = game.p2.option("cast", "star2")?.fields.find((f) => f.name === "targets");
    const mossIdx = (field?.options ?? []).findIndex(
      (o) => Array.isArray(o) && (o as string[]).includes("moss1"),
    );
    expect(mossIdx).toBeGreaterThanOrEqual(0);
    expect(field?.unaffordable?.[mossIdx]).toBe(true);
    expect(field?.surcharge?.[mossIdx]).toBeGreaterThan(0);
    await expect(game.p2.cast("star2", { targets: ["moss1", "moss1"] })).rejects.toThrow();
    expect(game.zoneOf("star2")).toBe("hand");
    expect(game.state("moss1").damage).toBe(0);
  });

  // ── (b) P2 plays Herald of Spring on P2's turn ────────────────────────────────────────────

  test("(b) Herald of Spring's play trigger gives ITS CONTROLLER 2 XP: P2 1→3, P1 stays 1; Herald cost 4 + [calm]", async () => {
    const game = await p2PlaysHerald();
    expect(game.p2.xp()).toBe(3);
    expect(game.p1.xp()).toBe(1);
    expect(game.gameState.xpGainedThisTurn?.[P2]).toBe(2);
    expect(game.gameState.xpGainedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 0, fury: 2 } });
  });

  test("(b) now only P2's Mosstomper is 4 Might + Deflect; P1's (XP 1) stays 3 with no Deflect — the mirror image of (a)", async () => {
    const game = await p2PlaysHerald();
    expect(game.state("moss2").might).toBe(4);
    expect(hasDeflect(game, "moss2")).toBe(true);
    expect(game.state("moss1").might).toBe(3);
    expect(hasDeflect(game, "moss1")).toBe(false);
  });

  test("(b) P2's Falling Star on P1's Deflect-less Mosstomper needs NO [rainbow]: [moss1, moss1] is offered and castable with exactly 2 + [fury][fury] → pool 0", async () => {
    const game = await p2PlaysHerald();
    expect(game.p2.power("rainbow")).toBe(0);
    expect(starTuples(game, "p2", "star2")).toContainEqual(["moss1", "moss1"]);
    await game.p2.cast("star2", { targets: ["moss1", "moss1"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star2", controller: P2 })]);
  });

  test("(b) 6 damage kills P1's 3-Might Mosstomper; P2's leveled one is untouched; XP stays 1 / 3", async () => {
    const game = await p2PlaysHerald();
    await game.p2.cast("star2", { targets: ["moss1", "moss1"] });
    await game.settle();
    expect(game.zoneOf("moss1")).toBe("trash");
    expect(game.zoneOf("moss2")).toBe("battlefield-bfB");
    expect(game.state("moss2")).toMatchObject({ damage: 0, might: 4 });
    expect([game.p1.xp(), game.p2.xp()]).toEqual([1, 3]);
    expect(game.violations()).toEqual([]);
  });
});
