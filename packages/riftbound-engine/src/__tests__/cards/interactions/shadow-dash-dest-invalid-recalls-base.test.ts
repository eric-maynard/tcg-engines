/**
 * Interaction: Shadow Dash (ven-148-166, Calm/Order spell, 2 + [rainbow], [Flow] [5][rainbow][rainbow])
 *     "Move an enemy unit to a battlefield where you have units. If you have exactly two units there,
 *      they each get +1 [Might] this turn."
 *   × Determined Sentry (unl-111-219, Body unit, 1, 1 Might) "I can't move to base."
 *   × Shipyard Skulker (ogn-175-298, 3 Might vanilla) ×2 as P1's two units at the destination
 *   × Janna, Savior (sfd-053-221, [Reaction]) as P3's way of putting a third player's unit on the
 *     destination while Shadow Dash is still on the chain.
 *
 * Board: 3-player FFA, P1's turn. P2's Sentry stands at bfX; P1 has exactly two Skulkers at bfB.
 * P1 plays Shadow Dash on the Sentry, destination bfB.
 *
 * Question:
 *  (a) Nothing in response — where does the Sentry end up and do the two Skulkers get +1 [Might]?
 *  (b) In response P3 puts a unit of their own on bfB, so at resolution bfB holds units of two players
 *      other than the Sentry's controller (449.2) — where does the Sentry end up, and do the Skulkers
 *      still get +1?
 *  (c) Same as (b) but Shadow Dash is played from the trash for its [Flow] cost — is the cost still
 *      spent and is the spell still banished?
 * Key assertion: a destination that resolves to null must NEVER send the mover to its owner's HAND.
 *
 * Rules: 355.4.a (a valid Move location is one where the units are allowed to be present), 449.2 (a unit
 * cannot move to a battlefield that already has units from 2 OTHER players), 447.2.c (a Move that would
 * make a unit present where it cannot be instead RECALLS), 455 (a Recall relocates a Permanent to its
 * BASE — never hand, deck or trash), 456 / 456.1 / 456.3 (a Recall is not a Move: no move triggers, and
 * movement restrictions cannot stop it), 359.3.e.12 (a check on information that is no longer available
 * returns null and calculations based on it are ignored), 359.3.e.14.a (a later linked instruction is
 * ignored when its earlier linked instruction was), 359.3.e.10 (the spell is still considered played),
 * 450 (the destination becomes Contested), 451 (a Move may cause a Showdown).
 *
 * Expected: (a) the Sentry moves bfX→bfB, "there" is bfB, P1 controls exactly two units there, so both
 * Skulkers get +1 this turn (the arriving enemy Sentry is not P1's unit); bfB becomes Contested and a
 * showdown follows. (b) bfB is an invalid destination for a P2 unit, so per 447.2.c the Sentry RECALLS to
 * its base — the move never happens, so "there" has no value and the linked +1 is ignored even though P1
 * does control exactly two units at bfB. Nothing else is substituted: no damage, no showdown from the
 * Sentry, no second move offered. (c) costs already paid stay paid — the Flow cost is not refunded, Shadow
 * Dash is banished rather than trashed, and it still counts as played.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const SHADOW_DASH = "ven-148-166";
const SENTRY = "unl-111-219";
const SKULKER = "ogn-175-298";
const JANNA = "sfd-053-221";

/**
 * 3-player FFA, turn 2, P1 active. `dashIn` decides whether Shadow Dash is cast from hand (normal cost)
 * or from the trash for its [Flow] cost. `bfBController` is who the battlefield is recorded to: P1 in the
 * quiet branch, P3 in the branches where P3 drops a [Reaction] unit onto it (a unit may only be played to
 * a battlefield its controller controls — P1's two Skulkers still make bfB "a battlefield where you have
 * units" for Shadow Dash either way).
 */
function board(opts: { dashIn?: "hand" | "trash"; bfBController?: typeof P1 | typeof P3 } = {}) {
  const { bfBController = P1, dashIn = "hand" } = opts;
  const s = scenario({ players: 3 })
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 20, power: { calm: 5, chaos: 5, order: 5, rainbow: 5 } })
    .resources(P2, { energy: 20, power: { calm: 5, chaos: 5, order: 5, rainbow: 5 } })
    .resources(P3, { energy: 20, power: { calm: 5, chaos: 5, order: 5, rainbow: 5 } })
    .battlefield("bfX", { controller: P2 })
    .battlefield("bfB", { controller: bfBController })
    .battlefield("bfZ", { controller: P3 })
    .unit(P2, "bfX", SENTRY, "sentry")
    .unit(P1, "bfB", SKULKER, "sk1")
    .unit(P1, "bfB", SKULKER, "sk2")
    .unit(P3, "bfZ", { might: 2, name: "W" }, "w")
    .hand(P3, JANNA, "janna");
  return dashIn === "trash" ? s.trash(P1, SHADOW_DASH, "dash") : s.hand(P1, SHADOW_DASH, "dash");
}

/** Pass chain priority round-robin until the chain is empty (or a non-priority decision appears). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.acting().passPriority();
  }
}

/** P3 reacts by playing Janna to bfB (declining her "move up to one enemy unit" rider). */
async function p3DropsAUnitOnBfB(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.seat(P2).passPriority();
  await game.seat(P3).play("janna", { to: "bfB" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P3, targeting: "up-to" });
  await game.seat(P3).decline(); // leave P1's Skulkers exactly where they are
  await drainChain(game);
}

describe("Shadow Dash × Determined Sentry — an invalid destination Recalls to base", () => {
  test("(a) the move resolves: the Sentry lands at bfB and P1's two Skulkers each get +1 [Might] this turn", async () => {
    const game = await board().build();
    await game.p1.cast("dash", { targets: "sentry" });
    // bfB is the only battlefield where P1 has units, so it is the only destination (355.4.a).
    expect(game.chain()).toMatchObject([{ cardId: "dash", targets: ["sentry"] }]);
    await drainChain(game);
    expect(game.locationOf("sentry")).toBe("bfB");
    expect(game.state("sk1").might).toBe(4);
    expect(game.state("sk2").might).toBe(4);
    expect(game.zoneOf("dash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) the arrival contests bfB for the Sentry's controller (450) and stages a showdown (451) — the 1-Might Sentry loses it", async () => {
    const game = await board().build();
    await game.p1.cast("dash", { targets: "sentry" });
    await drainChain(game);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
  });

  test("(a) the +1 is \"this turn\" — it is gone on the next turn", async () => {
    const game = await board().build();
    await game.p1.cast("dash", { targets: "sentry" });
    await drainChain(game);
    await game.settle();
    expect(game.state("sk1").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("sk1").might).toBe(3);
    expect(game.state("sk2").might).toBe(3);
  });

  test("(b) with a third player's unit on bfB the destination is invalid (449.2), so the Sentry RECALLS to its base — never to hand, deck or trash (455)", async () => {
    const game = await board({ bfBController: P3 }).build();
    await game.p1.cast("dash", { targets: "sentry" });
    await p3DropsAUnitOnBfB(game);
    // bfB now holds units of P1 and P3 — two players other than the Sentry's controller.
    expect(game.p1.units("bfB").length).toBe(2);
    expect(game.seat(P3).units("bfB").length).toBe(1);
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.locationOf("sentry")).toBe("base");
    expect(game.state("sentry").owner).toBe(P2);
    expect(["hand", "mainDeck", "trash", "banishment"]).not.toContain(game.zoneOf("sentry"));
    expect(game.violations()).toEqual([]);
  });

  test("(b) a Recall is not a Move (456), so \"I can't move to base\" does not stop it (456.3) and the Sentry keeps the restriction", async () => {
    const game = await board({ bfBController: P3 }).build();
    await game.p1.cast("dash", { targets: "sentry" });
    await p3DropsAUnitOnBfB(game);
    expect(game.state("sentry").keywords).toContain("NoMoveToBase");
    expect(game.state("sentry")).toMatchObject({ damage: 0, location: "base" });
  });

  test("(b) the mover never became present at bfB, so the linked \"if you have exactly two units there\" has no \"there\" (359.3.e.12/.e.14.a) — NO +1 [Might], even though P1 does control exactly two units at bfB", async () => {
    const game = await board({ bfBController: P3 }).build();
    await game.p1.cast("dash", { targets: "sentry" });
    await p3DropsAUnitOnBfB(game);
    expect(game.p1.units("bfB")).toHaveLength(2);
    expect(game.state("sk1").might).toBe(3);
    expect(game.state("sk2").might).toBe(3);
  });

  test("(b) nothing is substituted: no showdown at bfB from the Sentry, no damage, and no second move offered to P1", async () => {
    const game = await board({ bfBController: P3 }).build();
    await game.p1.cast("dash", { targets: "sentry" });
    await p3DropsAUnitOnBfB(game);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false });
    expect(game.state("sk1").damage).toBe(0);
    expect(game.state("sk2").damage).toBe(0);
    // The chain emptied straight back into P1's open main phase — no destination re-pick, no move menu.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
    expect(game.zoneOf("dash")).toBe("trash"); // cast from hand → trash
  });

  test("(c) played from the trash for [Flow]: the cost is spent, the spell is BANISHED (not trashed) and still counts as played — and the Recall outcome is unchanged", async () => {
    const game = await board({ bfBController: P3, dashIn: "trash" }).build();
    expect(game.zoneOf("dash")).toBe("trash");
    const before = game.p1.resources();
    const powerBefore = Object.values(before.power).reduce((a, b) => a + b, 0);
    await game.p1.cast("dash", { flow: true, targets: "sentry" });
    // [Flow] [5][rainbow][rainbow] — 5 energy and 2 power pips, charged as the spell is played.
    expect(game.p1.energy()).toBe(before.energy - 5);
    expect(Object.values(game.p1.resources().power).reduce((a, b) => a + b, 0)).toBe(powerBefore - 2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);

    await p3DropsAUnitOnBfB(game);
    expect(game.zoneOf("sentry")).toBe("base"); // still a Recall, still not the hand
    expect(game.state("sk1").might).toBe(3);
    expect(game.state("sk2").might).toBe(3);
    // The Flow clause banishes it after resolution; a fizzled instruction refunds nothing (359.3.e.10).
    expect(game.zoneOf("dash")).toBe("banishment");
    expect(game.p1.energy()).toBe(before.energy - 5);
    expect(game.violations()).toEqual([]);
  });
});
