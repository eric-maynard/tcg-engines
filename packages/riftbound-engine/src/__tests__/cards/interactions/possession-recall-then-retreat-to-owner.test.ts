/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8+[chaos]x3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base. This isn't a move.)"
 *   × Sett, Brawler (ogn-164-298) · Champion Unit · Body · 5+[body] · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (+ Rebuke ogn-172-298 "Return a unit at a battlefield to its owner's hand." for contrast (d))
 *
 * Rules: 477.1.a (controller is a layer-1 inherent trait), 455 / 456.1 / 456.3 (a recall is not a move),
 * 458.1 (recall keeps damage & statuses), 740.1.a (friendly = shares a controller), 702.2.b.2 (only the
 * controller may spend a buff), 127.1 (owner = who brought the card), 124.1 / 705 (leaving the board clears
 * damage/statuses/buffs), 190.4.c / 323.6 (no units at a battlefield in an open state → lose control).
 *
 * Question: P2's Sett (buffed, 2 damage, exhausted) alone at bf1; P1 resolves Possession on it.
 *   (a) Sett → P1's base under P1's control, still buffed (5), 2 damage, exhausted; not a move.
 *   (b) P1 may now activate "Spend my buff" (+4); P2 may not.
 *   (c) P1's Retreat on Sett is legal; Sett goes to its OWNER's (P2's) hand as a fresh card; P2 channels.
 *   (d) P2 can neither Retreat it (not friendly to P2) nor Rebuke it (not at a battlefield).
 *   (e) P2 loses control of the now-empty bf1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const POSSESSION = "ogn-203-298";
const SETT = "ogn-164-298";
const RETREAT = "ogn-104-298";
const REBUKE = "ogn-172-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn. P2's buffed/damaged/exhausted Sett is P2's only unit at bf1. P1 also has a unit at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } }) // Possession 8+[chaos]x3, Retreat 1, 1 spare
    .resources(P2, { energy: 1 }) // enough for P2's Retreat (a Reaction)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", SETT, "sett", { buffed: true, damage: 2, exhausted: true })
    .unit(P1, "bf2", { might: 2, name: "P1 Scout" }, "mine")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, RETREAT, "p1Retreat")
    .hand(P2, RETREAT, "p2Retreat")
    .hand(P2, REBUKE, "p2Rebuke");
}

async function possessed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "sett" });
  await game.settle();
  return game;
}

describe("Possession × Sett × Retreat — control vs ownership after a take-control recall", () => {
  test("setup: Possession offers only ENEMY units AT A BATTLEFIELD (Sett), not P1's own unit; costs 8 + 3 chaos", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ controller: P2, owner: P2, might: 5, damage: 2, isExhausted: true, isBuffed: true });
    expect(targetsOffered(game, P1, "poss")).toEqual(["sett"]);
    await game.p1.cast("poss", { targets: "sett" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["poss"]);
  });

  test("(a) Possession: Sett is now controlled by P1 (owner still P2) and sits in base; bf1 is empty; spell to trash (477.1.a, 455)", async () => {
    const game = await possessed();
    const s = game.state("sett");
    expect(s.controller).toBe(P1);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("base");
    expect(s.location).toBe("base");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(a) the recall keeps Sett's state: still buffed (4+1 = 5 Might), still 2 damage, still exhausted (458.1)", async () => {
    const game = await possessed();
    const s = game.state("sett");
    expect(s.isBuffed).toBe(true);
    expect(s.might).toBe(5);
    expect(s.damage).toBe(2);
    expect(s.isExhausted).toBe(true);
  });

  test("(e) P2 has no units left at bf1 → loses control of it in cleanup (190.4.c / 323.6); P1 does not gain it", async () => {
    const game = await possessed();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bf2"]);
  });

  test("control change is permanent (no 'this turn'): Sett is still P1-controlled on P2's next turn", async () => {
    const game = await possessed();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett").controller).toBe(P1);
    expect(game.state("sett").owner).toBe(P2);
  });

  // Expected (740.1.a, 702.2.b.2): Sett is friendly to / controlled by P1, so P1 may activate "Spend my
  // buff": the buff is removed as the cost and Sett gets +4 this turn → 4 + 4 = 8. Actual: activation
  // legality is keyed on OWNER, so P1 is not offered the ability at all (and the spend-buff cost is
  // separately unimplemented — see ogn-164-298.test.ts).
  test.failing("BUG: (b) P1 (new controller) can activate Sett's 'Spend my buff' → buff removed, 8 Might this turn (702.2.b.2)", async () => {
    const game = await possessed();
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett", 1);
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("sett").might).toBe(8);
  });

  // Expected: P2 no longer controls Sett, so P2 cannot spend its buff / activate its ability. Actual: the
  // engine still lists `activateAbility:sett#1` for P2 (owner-based check) and lets it resolve.
  test.failing("BUG: (b) P2 (owner, no longer controller) can NOT activate Sett's ability (702.2.b.2)", async () => {
    const game = await possessed();
    expect(game.p2.can("activate", "sett")).toBe(false);
    const r = await game.p2.try((p) => p.activate("sett", 1));
    expect(r.ok).toBe(false);
    expect(game.state("sett").might).toBe(5);
  });

  // Expected (740.1.a, 127.1, 124.1, 705): Sett is friendly to P1 → a legal Retreat target for P1; it
  // returns to its OWNER's hand (P2), arriving as a fresh card (no buff, no damage). Actual: P1's Retreat
  // only offers owner-P1 units ("mine"); casting it at Sett is rejected.
  test.failing("BUG: (c) P1's Retreat may choose Sett (friendly to P1) and returns it to P2's hand — not P1's — with buff and damage cleared", async () => {
    const game = await possessed();
    expect(targetsOffered(game, P1, "p1Retreat").sort()).toEqual(["mine", "sett"]);
    const p1Hand0 = game.p1.hand().length;
    await game.p1.cast("p1Retreat", { targets: "sett" });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("hand");
    expect(game.p2.hand()).toContain("sett");
    expect(game.p1.hand()).not.toContain("sett");
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Retreat left P1's hand
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("sett").damage).toBe(0);
    expect(game.zoneOf("p1Retreat")).toBe("trash");
  });

  // Expected: "Its OWNER channels 1 rune exhausted" → P2's rune pool +1 (exhausted), P2's rune deck −1;
  // P1's runes unchanged. Actual: cast rejected (above); Retreat's channel clause is also unimplemented.
  test.failing("BUG: (c) after P1 Retreats the possessed Sett, its OWNER P2 channels 1 rune exhausted — P1 channels nothing", async () => {
    const game = await possessed();
    const p1Runes0 = game.p1.runes().length;
    const p2Runes0 = game.p2.runes().length;
    const p2Deck0 = game.p2.runeDeck().length;
    await game.p1.cast("p1Retreat", { targets: "sett" });
    await game.settle();
    expect(game.p2.runes()).toHaveLength(p2Runes0 + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runeDeck()).toHaveLength(p2Deck0 - 1);
    expect(game.p1.runes()).toHaveLength(p1Runes0);
  });

  test("(c) contrast: P1 Retreats a unit P1 OWNS → it goes to P1's hand", async () => {
    const game = await possessed();
    await game.p1.cast("p1Retreat", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.p1.hand()).toContain("mine");
    expect(game.p2.hand()).not.toContain("mine");
    expect(game.p1.energy()).toBe(1);
  });

  // Expected: …and P1 (the owner) channels 1 rune exhausted. Actual: Retreat's channel clause is not
  // implemented — no rune moves.
  test.failing("BUG: (c) contrast: when P1 Retreats its own unit, P1 channels 1 rune exhausted", async () => {
    const game = await possessed();
    const p1Runes0 = game.p1.runes().length;
    const p1Deck0 = game.p1.runeDeck().length;
    await game.p1.cast("p1Retreat", { targets: "mine" });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(p1Runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(p1Deck0 - 1);
  });

  // Expected (740.1.a): Sett is an ENEMY unit to P2 now, so P2's Retreat ("a friendly unit") has no legal
  // target among {sett} → with Sett as P2's only owned unit, P2 cannot cast Retreat at all. Actual: P2's
  // Retreat offers Sett (owner-based friendliness) and would return it to P2's hand.
  test.failing("BUG: (d) P2 cannot Retreat the possessed Sett — it is not friendly to P2 any more", async () => {
    const game = await possessed();
    expect(targetsOffered(game, P2, "p2Retreat")).not.toContain("sett");
    expect(game.p2.can("cast", "p2Retreat")).toBe(false);
    await expect(game.p2.cast("p2Retreat", { targets: "sett" })).rejects.toThrow();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett").controller).toBe(P1);
  });

  test("(d) P2's Rebuke ('a unit at a battlefield') on P2's turn is offered P1's Scout at bf2 but NOT Sett, who is in a base", async () => {
    const game = await possessed();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2, power: { chaos: 2 } });
    expect(game.p2.can("cast", "p2Rebuke")).toBe(true);
    const offered = targetsOffered(game, P2, "p2Rebuke");
    expect(offered).toContain("mine");
    expect(offered).not.toContain("sett");
    await expect(game.p2.cast("p2Rebuke", { targets: "sett" })).rejects.toThrow();
    expect(game.zoneOf("sett")).toBe("base");
  });
});
