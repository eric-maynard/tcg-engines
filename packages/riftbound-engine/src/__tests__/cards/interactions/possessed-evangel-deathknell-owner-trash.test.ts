/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.)"
 *   × Machine Evangel (ogn-239-298) · Unit · Order · 5 + [order] · 4 Might
 *     "[Deathknell] — Play three 1 [Might] Recruit unit tokens into your base."
 *   × Morbid Return (ogn-170-298) · Spell · Chaos · 2 · Action · "Return a unit from your trash to your hand."
 *   (+ contrast: Rebuke ogn-172-298 "Return a unit at a battlefield to its owner's hand." 2 + [chaos]×2;
 *      Retreat ogn-104-298 "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.")
 *
 * Question: earlier P1 resolved Possession on P2's Machine Evangel and later moved it to a battlefield.
 * On P2's turn P2 attacks there and the Evangel takes lethal combat damage.
 *   (a) Whose trash does the Evangel go to?
 *   (b) Does Deathknell trigger, who controls it, whose base gets the Recruits, and who OWNS them?
 *   (c) Later: can P1's Morbid Return get the Evangel? Can P2's? In what state does it come back?
 *   (d) Contrast: the possessed Evangel is Rebuked off the battlefield instead — where does it go,
 *       does anyone get Recruits?
 *
 * Rules: 323.5 / 428.2 (killed units go to their OWNER's trash), 056 / 056.2 (a card never enters
 * another player's non-board zone), 127.1 (owner), 808.1.d / 808.1.d.2 / 808.1.d.3 (Deathknell:
 * pending item added before the card moves, noting its details), 191.4.a / 191.4.b (ability
 * controller = source's controller at trigger time; later control changes don't matter), 182 / 183
 * (token controller / OWNER = whoever controlled the creating effect), 186.1 (a token in a non-board
 * zone ceases to exist), 124 / 124.1 (zone change → new object), 191.3, 428.1 (a bounce is not a kill).
 *
 * Expected: (a) P2's trash. (b) Deathknell triggers under P1's control → three Recruits in P1's base,
 * controlled AND owned by P1 (a later Retreat on one sends it to P1's hand where it ceases to exist,
 * and P1 — its owner — channels). (c) P1's Morbid Return cannot see it (P2's trash); P2's can → P2's
 * hand as a fresh card; replayed by P2 it is P2's. (d) Rebuke → P2's hand (owner), not a kill → no
 * Deathknell, no Recruits for anyone.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, passivePolicy, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const MACHINE_EVANGEL = "ogn-239-298";
const MORBID_RETURN = "ogn-170-298";
const REBUKE = "ogn-172-298";
const RETREAT = "ogn-104-298";

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn 2 with exactly Possession's cost. P2's Evangel (+ a guard, so bf1 stays P2's) at bf1;
 * bf2 is empty and uncontrolled. P2's 8-Might Bruiser waits in base for next turn. P1 has a unit in
 * its own trash so P1's Morbid Return is castable regardless. Victory score raised so the incidental
 * conquer/hold points never end the game.
 */
function board() {
  return scenario()
    .victoryScore(15)
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", MACHINE_EVANGEL, "evangel")
    .unit(P2, "bf1", { might: 2, name: "P2 Guard" }, "guard")
    .unit(P2, "base", { might: 8, name: "P2 Bruiser" }, "bruiser")
    .trash(P1, { cardType: "unit", might: 2, name: "P1 Corpse" }, "p1corpse")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, MORBID_RETURN, "p1morbid")
    .hand(P1, RETREAT, "p1retreat")
    .hand(P2, MORBID_RETURN, "p2morbid")
    .hand(P2, REBUKE, "p2rebuke");
}

/** P1 Possesses the Evangel, marches it into empty bf2, and passes the turn to P2 (P2's open main phase). */
async function possessedAtBf2(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "evangel" });
  await game.settle();
  expect(game.state("evangel")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
  await game.p1.move("evangel", "bf2");
  await game.settle();
  expect(game.state("evangel")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bf2" });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  return game;
}

/** …then P2's Bruiser (8) attacks bf2 and combat resolves: the 4-Might Evangel takes lethal damage. */
async function evangelDiesInCombat(): Promise<{ game: Game; deathknellControllers: string[] }> {
  const game = await possessedAtBf2();
  await game.p2.move("bruiser", "bf2");
  const deathknellControllers: string[] = [];
  await game.settle({
    policy: (d, g) => {
      for (const item of g.chain()) {
        if (item.cardId === "evangel" && item.triggered) {
          deathknellControllers.push(item.controller);
        }
      }
      return passivePolicy(d, g);
    },
  });
  return { deathknellControllers, game };
}

function recruitsIn(game: Game, zoneCards: readonly string[]): string[] {
  return zoneCards.filter((id) => game.state(id).name === "Recruit");
}

describe("Possessed Machine Evangel dies in combat — owner's trash, controller's Deathknell", () => {
  test("setup: Possession takes the Evangel (owner P2) under P1's control; P1 moves it to bf2 and it is P1's lone unit there on P2's turn", async () => {
    const game = await possessedAtBf2();
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.p1.units("bf2")).toEqual(["evangel"]);
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("evangel")).toMatchObject({ controller: P1, might: 4, owner: P2 });
  });

  // ---- (a) whose trash ------------------------------------------------------------------------------

  test("(a) killed by P2's 8-Might attacker, the Evangel goes to its OWNER's (P2's) trash — never P1's (323.5, 428.2, 056.2)", async () => {
    const { game } = await evangelDiesInCombat();
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.state("evangel").owner).toBe(P2);
    expect(game.p2.trash()).toContain("evangel");
    expect(game.p1.trash()).not.toContain("evangel");
    // P2 won the combat at bf2 and conquered it.
    expect(game.locationOf("bruiser")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("(a) in the trash it is a new object: no damage, and the take-control effect is gone (controller reads P2 again) (124.1)", async () => {
    const { game } = await evangelDiesInCombat();
    expect(game.state("evangel")).toMatchObject({ controller: P2, damage: 0, owner: P2, zone: "trash" });
  });

  // ---- (b) Deathknell: who controls it, whose base, who owns the tokens --------------------------------

  test("(b) Deathknell triggers and is controlled by P1 — the Evangel's controller when it died (808.1.d.2, 191.4.a, 191.4.b)", async () => {
    const { deathknellControllers, game } = await evangelDiesInCombat();
    expect(deathknellControllers.length).toBeGreaterThan(0);
    expect(new Set(deathknellControllers)).toEqual(new Set([P1]));
    expect(game.chain()).toEqual([]);
  });

  test("(b) 'your base' = P1's base: exactly three 1-Might Recruit tokens appear in P1's base and none in P2's", async () => {
    const { game } = await evangelDiesInCombat();
    const p1Recruits = recruitsIn(game, game.cardsAt("base", P1));
    expect(p1Recruits).toHaveLength(3);
    for (const r of p1Recruits) {
      expect(game.state(r)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    }
    expect(recruitsIn(game, game.cardsAt("base", P2))).toEqual([]);
    expect(game.p1.units("base")).toHaveLength(3);
  });

  test("(b) the Recruit tokens are OWNED by P1 — the controller of the effect that created them — not by the Evangel's owner P2 (183)", async () => {
    const { game } = await evangelDiesInCombat();
    const recruits = recruitsIn(game, [...game.cardsAt("base", P1), ...game.cardsAt("base", P2)]);
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r).owner).toBe(P1);
    }
  });

  test("(b) consequence of ownership: on P1's next turn P1 Retreats a Recruit → it goes to P1's hand and ceases to exist, and P1 (its owner) channels 1 rune exhausted; P2 channels nothing (186.1, Retreat text)", async () => {
    const { game } = await evangelDiesInCombat();
    await game.advanceToTurnOf(P1);
    const recruit = recruitsIn(game, game.cardsAt("base", P1))[0] as string;
    expect(recruit).toBeDefined();
    await game.p1.do("addResources", { energy: 1 });
    expect(targetsOffered(game, P1, "p1retreat")).toContain(recruit);
    const p1Runes0 = game.p1.runes().length;
    const p1Exhausted0 = game.p1.runes({ ready: false }).length;
    const p2Runes0 = game.p2.runes().length;
    const p1Hand0 = game.p1.hand().length;
    await game.p1.cast("p1retreat", { targets: recruit });
    await game.settle();
    expect(game.has(recruit) ? game.zoneOf(recruit) : "gone").not.toBe("base");
    expect(game.p1.hand()).not.toContain(recruit); // a token in hand ceases to exist
    expect(game.p2.hand()).not.toContain(recruit);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Retreat left the hand
    expect(recruitsIn(game, game.cardsAt("base", P1))).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(p1Runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(p1Exhausted0 + 1);
    expect(game.p2.runes()).toHaveLength(p2Runes0);
  });

  // ---- (c) Morbid Return -------------------------------------------------------------------------------

  test("(c) P2's Morbid Return ('a unit from YOUR trash') is offered the Evangel and returns it to P2's hand", async () => {
    const { game } = await evangelDiesInCombat();
    await game.p2.do("addResources", { energy: 2 });
    expect(game.p2.can("cast", "p2morbid")).toBe(true);
    expect(targetsOffered(game, P2, "p2morbid")).toEqual(["evangel"]);
    await game.p2.cast("p2morbid", { targets: "evangel" });
    await game.settle();
    expect(game.zoneOf("evangel")).toBe("hand");
    expect(game.p2.hand()).toContain("evangel");
    expect(game.p1.hand()).not.toContain("evangel");
    expect(game.zoneOf("p2morbid")).toBe("trash");
  });

  test("(c) it comes back as a fresh card: no damage, no lingering control change — replayed by P2 it enters P2's base under P2's control at 4 Might (124.1, 191.3)", async () => {
    const { game } = await evangelDiesInCombat();
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.cast("p2morbid", { targets: "evangel" });
    await game.settle();
    expect(game.state("evangel")).toMatchObject({ controller: P2, damage: 0, owner: P2, zone: "hand" });
    await game.p2.do("addResources", { energy: 5, power: { order: 1 } });
    expect(game.p2.can("play", "evangel")).toBe(true);
    await game.p2.play("evangel", { to: "base" });
    await game.settle();
    expect(game.state("evangel")).toMatchObject({ controller: P2, damage: 0, isBuffed: false, might: 4, owner: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("evangel");
    expect(game.p1.units("base")).not.toContain("evangel");
  });

  test("(c) P1's Morbid Return on P1's next turn only sees P1's own trash (the Corpse) — the Evangel in P2's trash is not offered and cannot be chosen (056)", async () => {
    const { game } = await evangelDiesInCombat();
    await game.advanceToTurnOf(P1);
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.can("cast", "p1morbid")).toBe(true);
    const offered = targetsOffered(game, P1, "p1morbid");
    expect(offered).toContain("p1corpse");
    expect(offered).not.toContain("evangel");
    await expect(game.p1.cast("p1morbid", { targets: "evangel" })).rejects.toThrow();
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.p2.trash()).toContain("evangel");
  });

  // ---- (d) contrast: bounced instead of killed --------------------------------------------------------

  test("(d) P2 Rebukes the possessed Evangel off bf2: it returns to its OWNER's hand (P2's), not P1's, as a fresh card (card text, 056.2, 124.1)", async () => {
    const game = await possessedAtBf2();
    await game.p2.do("addResources", { energy: 2, power: { chaos: 2 } });
    expect(targetsOffered(game, P2, "p2rebuke")).toContain("evangel");
    await game.p2.cast("p2rebuke", { targets: "evangel" });
    await game.settle();
    expect(game.zoneOf("evangel")).toBe("hand");
    expect(game.p2.hand()).toContain("evangel");
    expect(game.p1.hand()).not.toContain("evangel");
    expect(game.state("evangel")).toMatchObject({ controller: P2, damage: 0, owner: P2 });
    expect(game.p2.trash()).not.toContain("evangel");
    // P1 has nothing left at bf2 → loses control of it.
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller ?? null).not.toBe(P1);
  });

  test("(d) a bounce is not a kill (428.1): no Deathknell goes on the chain and nobody gets Recruit tokens (808.1.d)", async () => {
    const game = await possessedAtBf2();
    await game.p2.do("addResources", { energy: 2, power: { chaos: 2 } });
    await game.p2.cast("p2rebuke", { targets: "evangel" });
    const seen: string[] = [];
    await game.settle({
      policy: (d, g) => {
        seen.push(...g.chain().filter((i) => i.triggered).map((i) => i.cardId));
        return passivePolicy(d, g);
      },
    });
    expect(seen).not.toContain("evangel");
    expect(game.chain()).toEqual([]);
    expect(recruitsIn(game, [...game.cardsAt("base", P1), ...game.cardsAt("base", P2)])).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
