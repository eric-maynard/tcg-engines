/**
 * Interaction: Sett, Brawler (ogn-164-298) × Hallowed Tomb (ogn-281-298) × Zhonya's Hourglass (ogn-077-298)
 *
 *   Sett, Brawler — Champion Unit (Sett) · Body · 5 + [body] · 4 Might
 *     "When I'm played and when I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)
 *      Spend my buff: Give me +4 [Might] this turn."                        — P1's Chosen Champion (legend: The Boss)
 *   Hallowed Tomb — Battlefield
 *     "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone
 *      if it is empty."                                                     — P1 controls it with a Gravekeeper on it
 *   Zhonya's Hourglass — Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it." — Case B only
 *
 * Rules: 705 (a unit leaving play loses all buffs), 705.1 (champions do NOT retain buffs in the Champion
 * Zone even if they return there), 748 / 124 (zone change to a non-board zone strips counters → new object),
 * 108.3.c.1 (a Chosen Champion may return to the zone only if it is empty), 108.3.d (played from there as
 * normal), 426.1.b.1 (already buffed → no second counter), 455 / 456 (a recall relocates a permanent to base
 * without being a move — it never leaves the board).
 *
 * Question: Sett is on the board with 1 Buff (5 Might); P1's Champion Zone is empty.
 *   Case A — Sett dies in combat → trash; next turn P1 holds Hallowed Tomb, returns Sett to the Champion
 *            Zone and plays him again. Buff counters (i) in the trash, (ii) in the Champion Zone, (iii) on
 *            entering the board before "When I'm played" resolves, (iv) after it resolves — 5 or 6 Might?
 *   Case B — instead of dying, Zhonya's Hourglass replaces the death. Does the recalled Sett keep his buff?
 *
 * Expected: A (i) 0 / 4 Might, (ii) 0, (iii) 0 counters, 4 Might (a brand-new object), (iv) exactly one
 * counter → 5 Might, not 6. B: yes — recall is not a zone change: same object, healed, exhausted, in base,
 * still buffed = 5 Might; the Hourglass is in the trash instead.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT_BRAWLER = "ogn-164-298";
const HALLOWED_TOMB = "ogn-281-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";
const THE_BOSS = "ogn-269-298"; // Legend · Sett — makes Sett, Brawler P1's Chosen Champion (103.2.a.3)

/**
 * P2's turn (turn 2, main). P1: legend The Boss — EXHAUSTED, with no power, so its own optional costed
 * death-replacement can never be paid and stays out of the way; Hallowed Tomb ("tomb", live abilities)
 * controlled by P1 with a vanilla Gravekeeper on it (→ P1 will HOLD it next turn); bf2 controlled by P1
 * with a BUFFED Sett, Brawler (5 Might) on it; empty Champion Zone; six ready body runes for the replay.
 * P2: a vanilla 8-Might Brute in base, ready to walk into bf2. Case B adds Zhonya's Hourglass to P1's base.
 */
function board(opts: { hourglass?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .card("boss", { def: THE_BOSS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .battlefield("tomb", { controller: P1, def: HALLOWED_TOMB, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "tomb", { might: 2, name: "Gravekeeper" }, "keeper")
    .unit(P1, "bf2", SETT_BRAWLER, "sett", { buffed: true })
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
    .runes(P1, "body", 6);
  if (opts.hourglass) {
    b.gear(P1, ZHONYAS_HOURGLASS, "hourglass");
  }
  return b;
}

/** Case A step 1: the Brute attacks bf2; nobody acts; 8 ≥ 5 kills Sett → P1's trash; P2 conquers bf2. */
async function settDiesInCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5, zone: "battlefield-bf2" });
  expect(game.p1.champion()).toBeUndefined();
  await game.p2.move("brute", "bf2");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.zoneOf("sett")).toBe("trash");
  return game;
}

/** Case A step 2: P2 ends the turn → P1 holds the Tomb → "you may" → yes → Sett trash → Champion Zone; into P1's main phase. */
async function settBackInChampionZone(): Promise<Game> {
  const game = await settDiesInCombat();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
  await game.p1.yes();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.phase()).toBe("main");
  expect(game.zoneOf("sett")).toBe("championZone");
  return game;
}

/** Case A step 3: pay 5 + [body] from runes and play Sett from the Champion Zone to base (his play trigger is now pending). */
async function settReplayed(): Promise<Game> {
  const game = await settBackInChampionZone();
  await game.p1.tapRunes(5);
  await game.p1.recycleRune(undefined, "body");
  expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1 } });
  expect(game.p1.can("playChampion")).toBe(true);
  await game.p1.playChampion("base");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  return game;
}

/** Case B: same attack with the Hourglass out; if asked to order replacements (The Boss is also printed as one), apply the Hourglass first. */
async function settSavedByHourglass(): Promise<Game> {
  const game = await board({ hourglass: true }).build();
  await game.p2.move("brute", "bf2");
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "replacement-order") {
    expect(d.seat).toBe(P1);
    await game.p1.pick("hourglass");
  }
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

describe("Case A — Sett dies, comes back through Hallowed Tomb, and is replayed: the buff never survives the round trip", () => {
  test("(i) killed in combat (8 vs 5): Sett is in P1's trash with NO buff — 0 counters, printed 4 Might (705, 748/124); P2 conquered bf2", async () => {
    const game = await settDiesInCombat();
    expect(game.p1.trash()).toContain("sett");
    expect(game.state("sett")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: false, might: 4, zone: "trash" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("brute")).toBe("battlefield-bf2");
  });

  test("next turn P1 HOLDS the Tomb (hold point) and its optional trigger asks P1; the Champion Zone is empty so 'yes' is meaningful (108.3.c.1)", async () => {
    const game = await settDiesInCombat();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tomb", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("sett")).toBe("trash");
  });

  test("(ii) returned to the CHAMPION ZONE (not hand/board) — still 0 counters there: champions do not retain buffs in the Champion Zone (705.1)", async () => {
    const game = await settBackInChampionZone();
    expect(game.p1.champion()).toBe("sett");
    expect(game.p1.trash()).not.toContain("sett");
    expect(game.p1.hand()).not.toContain("sett");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, zone: "championZone" });
  });

  test("(iii) played from the Champion Zone as normal (108.3.d) for 5 + [body]: he enters base exhausted as a brand-new object — 0 counters, 4 Might — with 'When I'm played, buff me' waiting on the chain", async () => {
    const game = await settReplayed();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: true })]);
    expect(game.state("sett")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 4, zone: "base" });
  });

  test("(iv) the play trigger resolves: exactly ONE buff counter → 5 Might, not 6 (nothing was retained to stack onto; 426.1.b.1 would forbid a second anyway)", async () => {
    const game = await settReplayed();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5, zone: "base" });
    expect(game.state("sett").might).not.toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("and that fresh buff is a real, spendable one: 'Spend my buff' → +4 this turn = 8 Might, un-buffed", async () => {
    const game = await settReplayed();
    await game.settle();
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett", 1);
    expect(game.state("sett").isBuffed).toBe(false);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8 });
  });
});

describe("Case B — Zhonya's Hourglass replaces the death: recall is not a zone change, the buff stays", () => {
  test("the Hourglass is killed instead; Sett never reaches the trash — he is in P1's BASE (recalled, 455), the same object", async () => {
    const game = await settSavedByHourglass();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.p1.base()).toContain("sett");
    expect(game.p1.trash()).not.toContain("sett");
    expect(game.p1.champion()).toBeUndefined(); // nothing went to the Champion Zone either
  });

  test("recalled Sett is healed (0 damage), EXHAUSTED, and STILL BUFFED — 1 counter, 5 Might (705/748 do not apply to a board→board relocation, 456.2)", async () => {
    const game = await settSavedByHourglass();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: true, isExhausted: true, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("combat outcome around the replacement: the Brute survives at bf2 (Sett's 5 < 8), P2 takes the now-empty bf2 and scores; the legend was never involved (still exhausted, Sett's buff not spent)", async () => {
    const game = await settSavedByHourglass();
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.state("sett").isBuffed).toBe(true);
  });

  test("the kept buff persists into P1's turn and is spendable there: (P1 again holds the Tomb, but with Sett alive there is nothing in the trash to return) still 5 Might, readied; 'Spend my buff' → 8", async () => {
    const game = await settSavedByHourglass();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    // The Tomb's hold trigger still asks its "you may" — decline (or accept: no Chosen Champion in the trash → no-op).
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: false, might: 5, zone: "base" });
    await game.p1.activate("sett", 1);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8 });
  });
});
