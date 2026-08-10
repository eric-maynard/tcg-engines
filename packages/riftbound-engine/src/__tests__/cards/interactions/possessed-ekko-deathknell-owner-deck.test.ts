/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.)"
 *   × Ekko, Recurrent (ogn-110-298) · Champion Unit · Mind · 5 + [mind] · 5 Might
 *     "[Accelerate] … [Deathknell] — Recycle me to ready your runes. (When I die, get the effect.)"
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order]×2 · Action · "Kill a unit."
 *
 * Question: earlier P1 resolved Possession on P2's Ekko; Ekko now sits in P1's base (owner P2 /
 * controller P1). Both players have exhausted runes. On P2's turn P2 casts Vengeance on Ekko.
 *   (a) Is Ekko a legal Vengeance target for P2 (its own card)? Whose trash does it go to?
 *   (b) Does Deathknell trigger, and who controls it — P1 (controller at death) or P2 (owner)?
 *   (c) "Recycle me": bottom of whose deck — P1's (the recycling player) or P2's? Can it ever land in
 *       P1's deck or trash?
 *   (d) Whose runes ready?
 *   (e) Contrast: an un-possessed Ekko killed the same way.
 *
 * Rules: 740.1.b (friendly/enemy are controller-relative), 428.2 + 056 / 056.2 (a killed permanent goes
 * to its OWNER's trash; a card never enters another player's deck/trash/hand), 127.1 (owner), 808.1.c /
 * 808.1.d.2 / 808.1.d.3 (Deathknell pends before the card leaves the board, noting its controller),
 * 191.4.a / 191.4.b (ability controller = source's controller then; later zone changes don't move it),
 * 416.1.c (Recycle → bottom of its OWNER's Main Deck).
 *
 * Expected: (a) legal ("a unit"; Ekko is even ENEMY to P2 now); Ekko → P2's trash, never P1's. (b)
 * Deathknell triggers under P1's control. (c) P1 pays "Recycle me" but Ekko goes to the bottom of P2's
 * deck: P1 deck/trash unchanged, P2 deck +1 with Ekko last, P2 trash without Ekko. (d) all of P1's runes
 * ready; P2's exhausted runes stay exhausted. (e) un-stolen: same zones (P2 trash → P2 deck bottom) but
 * P2 controls the trigger and P2's runes ready — zones follow ownership, the payoff follows control.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, passivePolicy, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const EKKO = "ogn-110-298";
const VENGEANCE = "ogn-229-298";

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn 2 with exactly Possession's cost and three already-EXHAUSTED chaos runes. P2's Ekko (+ a
 * Guard, so bf1 stays P2's) at bf1. P2 has six order runes (to pay for Vengeance on its own turn) and
 * Vengeance in hand. Victory score raised so no incidental point ends the game.
 */
function board() {
  return scenario()
    .victoryScore(15)
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", EKKO, "ekko")
    .unit(P2, "bf1", { might: 2, name: "P2 Guard" }, "guard")
    .runes(P1, "chaos", 3, { exhausted: true })
    .runes(P2, "order", 6)
    .hand(P1, POSSESSION, "poss")
    .hand(P2, VENGEANCE, "veng");
}

/** P1 Possesses Ekko (→ P1's base, owner P2), passes the turn; P2 recycles 2 runes and taps 4 → 4 + [order]×2, 4 runes exhausted. */
async function possessedOnP2Turn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "ekko" });
  await game.settle();
  expect(game.state("ekko")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  // P1's runes were not readied by P2's Awaken; P2 now pays for Vengeance the honest way.
  expect(game.p1.runes({ ready: true })).toEqual([]);
  await game.p2.recycleRune({ domain: "order" });
  await game.p2.recycleRune({ domain: "order" });
  await game.p2.tapRunes(4);
  expect(game.p2.resources()).toEqual({ energy: 4, power: { order: 2 } });
  expect(game.p2.runes({ ready: false })).toHaveLength(4);
  return game;
}

interface Snapshot {
  readonly p1Deck: readonly string[];
  readonly p2Deck: readonly string[];
  readonly p1Trash: readonly string[];
  readonly p2Trash: readonly string[];
  readonly p2Ready: number;
  readonly p2Exhausted: number;
}

function snap(game: Game): Snapshot {
  return {
    p1Deck: game.p1.deck(),
    p1Trash: game.p1.trash(),
    p2Deck: game.p2.deck(),
    p2Exhausted: game.p2.runes({ ready: false }).length,
    p2Ready: game.p2.runes({ ready: true }).length,
    p2Trash: game.p2.trash(),
  };
}

/** P2 casts Vengeance on Ekko and everything settles; records who controlled the Deathknell item and whether Ekko was ever seen in a P1 pile. */
async function vengeanceKillsEkko(game: Game): Promise<{ before: Snapshot; deathknellControllers: string[]; ekkoSeenInP1Pile: boolean }> {
  const before = snap(game);
  const deathknellControllers: string[] = [];
  let ekkoSeenInP1Pile = false;
  await game.p2.cast("veng", { targets: "ekko" });
  await game.settle({
    policy: (d, g) => {
      ekkoSeenInP1Pile ||= g.p1.trash().includes("ekko") || g.p1.deck().includes("ekko") || g.p1.hand().includes("ekko");
      for (const item of g.chain()) {
        if (item.cardId === "ekko" && item.triggered) {
          deathknellControllers.push(item.controller);
        }
      }
      return passivePolicy(d, g);
    },
  });
  expect(game.chain()).toEqual([]);
  return { before, deathknellControllers, ekkoSeenInP1Pile };
}

describe("Possessed Ekko dies to its owner's Vengeance — Deathknell control vs. owner's zones", () => {
  test("setup: after Possession Ekko is in P1's base under P1's control but still OWNED by P2; on P2's turn P1's three runes are still exhausted", async () => {
    const game = await possessedOnP2Turn();
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.p1.units("base")).toEqual(["ekko"]);
    expect(game.p2.units("base")).toEqual([]);
    expect(game.state("ekko")).toMatchObject({ controller: P1, might: 5, owner: P2 });
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  // ---- (a) targeting + whose trash --------------------------------------------------------------------

  test("(a) Vengeance ('Kill a unit') offers Ekko to P2 — no friendly/enemy restriction, and Ekko is in fact an ENEMY unit to its owner right now (740.1.b)", async () => {
    const game = await possessedOnP2Turn();
    expect(game.p2.can("cast", "veng")).toBe(true);
    expect(targetsOffered(game, "veng").sort()).toEqual(["ekko", "guard"]);
    await game.p2.cast("veng", { targets: "ekko" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "veng", controller: P2, targets: ["ekko"] })]);
  });

  test("(a) when Vengeance resolves Ekko leaves P1's base and is never, at any observable point, in P1's trash or P1's deck (428.2, 056.2)", async () => {
    const game = await possessedOnP2Turn();
    const { ekkoSeenInP1Pile } = await vengeanceKillsEkko(game);
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.base()).not.toContain("ekko");
    expect(ekkoSeenInP1Pile).toBe(false);
    expect(game.p1.trash()).not.toContain("ekko");
    expect(game.state("ekko").owner).toBe(P2);
  });

  // ---- (b) Deathknell triggers under P1's control -----------------------------------------------------

  test("(b) Deathknell triggers and the chain item is controlled by P1 — Ekko's controller when he died — not by owner P2 (808.1.d.2, 191.4.a/b)", async () => {
    const game = await possessedOnP2Turn();
    await game.p2.cast("veng", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves → Ekko dies → Deathknell finalized
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", controller: P1, triggered: true, type: "ability" })]);
    // P1, who finalized it, holds priority first (340.4).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) across the whole resolution the Deathknell item is only ever seen under P1's control", async () => {
    const game = await possessedOnP2Turn();
    const { deathknellControllers } = await vengeanceKillsEkko(game);
    expect(deathknellControllers.length).toBeGreaterThan(0);
    expect(new Set(deathknellControllers)).toEqual(new Set([P1]));
  });

  // ---- (c) "Recycle me" → bottom of the OWNER's deck --------------------------------------------------

  test("(c) 'Recycle me' is paid by P1 as the item is finalized, yet Ekko goes to the BOTTOM of P2's Main Deck: P2 deck +1 with Ekko last, P2 trash without Ekko (416.1.c, 056.2)", async () => {
    const game = await possessedOnP2Turn();
    const { before } = await vengeanceKillsEkko(game);
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p2.deck()).toHaveLength(before.p2Deck.length + 1);
    expect(game.p2.deck().at(-1)).toBe("ekko");
    expect(game.p2.deck().slice(0, -1)).toEqual([...before.p2Deck]); // rest of P2's deck untouched, Ekko under it
    expect(game.p2.trash()).not.toContain("ekko");
    expect(game.p2.trash()).toEqual([...before.p2Trash, "veng"]);
  });

  test("(c) …and never P1's: P1's deck is unchanged card-for-card and P1's trash gained nothing", async () => {
    const game = await possessedOnP2Turn();
    const { before } = await vengeanceKillsEkko(game);
    expect(game.p1.deck()).toEqual([...before.p1Deck]);
    expect(game.p1.trash()).toEqual([...before.p1Trash]);
    expect(game.p1.deck()).not.toContain("ekko");
  });

  test("(c) the cost is paid at FINALIZATION: while the Deathknell item still sits on the chain Ekko is already at the bottom of P2's deck and P1's runes are still exhausted (383.3.b)", async () => {
    const game = await possessedOnP2Turn();
    await game.p2.cast("veng", { targets: "ekko" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", triggered: true })]);
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("ekko");
    expect(game.p1.deck()).not.toContain("ekko");
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // payoff waits for resolution
  });

  // ---- (d) whose runes ready --------------------------------------------------------------------------

  test("(d) 'ready YOUR runes' = the ability controller's: all three of P1's runes become ready; P2's four exhausted runes stay exhausted", async () => {
    const game = await possessedOnP2Turn();
    const { before } = await vengeanceKillsEkko(game);
    expect(before.p2Exhausted).toBe(4);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.runes({ ready: false })).toHaveLength(0);
    expect(game.p2.runes({ ready: false })).toHaveLength(before.p2Exhausted);
    expect(game.p2.runes({ ready: true })).toHaveLength(before.p2Ready);
    expect(game.p1.energy()).toBe(0); // readying adds no energy by itself
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (e) contrast: un-possessed Ekko ----------------------------------------------------------------

  test("(e) contrast — P2 Vengeances its OWN un-stolen Ekko: same zones (→ P2's trash → bottom of P2's deck), but P2 controls the Deathknell and P2's runes ready while P1's stay exhausted", async () => {
    const game = await scenario()
      .victoryScore(15)
      .turn(3)
      .active(P2)
      .unit(P2, "base", EKKO, "ekko")
      .runes(P1, "chaos", 3, { exhausted: true })
      .runes(P2, "order", 6)
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.recycleRune({ domain: "order" });
    await game.p2.recycleRune({ domain: "order" });
    await game.p2.tapRunes(4);
    expect(game.p2.runes({ ready: false })).toHaveLength(4);
    expect(targetsOffered(game, "veng")).toEqual(["ekko"]);
    const { before, deathknellControllers } = await vengeanceKillsEkko(game);
    expect(new Set(deathknellControllers)).toEqual(new Set([P2]));
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p2.deck()).toHaveLength(before.p2Deck.length + 1);
    expect(game.p2.deck().at(-1)).toBe("ekko");
    expect(game.p1.deck()).toEqual([...before.p1Deck]);
    expect(game.p1.trash()).toEqual([...before.p1Trash]);
    expect(game.p2.trash()).toEqual([...before.p2Trash, "veng"]);
    // The beneficiary flips with control: P2's runes ready, P1's do not.
    expect(game.p2.runes({ ready: true })).toHaveLength(4);
    expect(game.p2.runes({ ready: false })).toHaveLength(0);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });
});
