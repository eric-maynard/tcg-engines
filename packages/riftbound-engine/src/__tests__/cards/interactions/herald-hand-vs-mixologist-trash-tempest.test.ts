/**
 * Interaction: Heart of the Tempest (ven-197-166, Legend) "When you play a card from anywhere other
 *   than your hand, empower me."
 *   × Rift Herald (unl-179-219) "[Deathknell] Play a unit from your hand to your base, ignoring its
 *     Energy cost. (You must still pay its Power cost.)"
 *   × Glasc Mixologist (sfd-165-221) "[Deathknell] — You may play a unit with cost no more than [3]
 *     and no more than [rainbow] from your trash, ignoring its cost."
 *   Played unit in both cases: Legion Rearguard (ogn-010-298, 2-energy Fury unit, [Accelerate] —
 *   "You may pay [1][fury] as an additional cost to have me enter ready.")
 *
 * Question: P1's legend is Heart of the Tempest, P1 controls bf1, and it is P2's turn. Case A: P1's
 * Rift Herald dies while P1 holds an Accelerate unit. Case B: P1's Glasc Mixologist dies with that
 * unit in P1's trash. For each: (1) may P1 decline? (2) who picks the location — can the unit go to
 * bf1? (3) is Accelerate still offered and what is paid? (4) does it enter exhausted? (5) does Heart
 * of the Tempest trigger? (6) does it matter that this is P2's turn?
 *
 * Rules: 128.6 / 128.6.a (an instruction acting on a PRIVATE zone that names a card type cannot
 * compel — P1 may decline Herald's play even without "may"), 355.10.a (the hand unit is not a
 * target; it is chosen on resolution), 419.3 / 419.3.b (Limited Play by effect: normal play steps
 * "except as noted" — Herald dictates "to your base"), 355.2.a (default locations: base or a
 * battlefield you control — Mixologist), 356.1.b.1 ("ignoring its cost" → Energy AND Power → 0),
 * 356.1.b.2 ("ignoring its Energy cost" → only Energy → 0), 356.1.b.3 + 355.1.a + 356.2.b.1 + 805.2
 * (Accelerate is an optional ADDITIONAL cost declared while playing and added on top of the zeroed
 * base cost — its [1][fury] is paid in full), 143.4 / 805.6 (enters exhausted unless Accelerate was
 * paid), 419.4.a (play triggers fire when the play completes) — Heart of the Tempest keys on the
 * ORIGIN ZONE: hand → no empower (Herald), trash → empower (Mixologist), 309.1 / 323.6 (the pending
 * Deathknell keeps the turn Closed, so the emptied bf1 is still P1's and a legal Mixologist
 * destination), 191.1 / 191.3 (P1 plays and controls the unit even on P2's turn), 808.1.d.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEART_OF_THE_TEMPEST = "ven-197-166";
const RIFT_HERALD = "unl-179-219";
const GLASC_MIXOLOGIST = "sfd-165-221";
const LEGION_REARGUARD = "ogn-010-298"; // 2 energy, no power, 2 Might, [Accelerate] [1][fury]
const FINAL_SPARK = "ogs-022-024"; // P2's removal: Deal 8 to a unit (kills Herald 7 / Mixologist 5)

/**
 * P2's turn. P1: Heart of the Tempest (not empowered), controls bf1 where the dying unit stands
 * alone, and has EXACTLY [1] energy + [1] fury — enough for Accelerate, not enough for Rearguard's
 * printed 2 energy. P2 holds Final Spark with 8 energy.
 */
function heraldBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .legend(P1, HEART_OF_THE_TEMPEST, "hot")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RIFT_HERALD, "herald")
    .hand(P1, LEGION_REARGUARD, "rg")
    .hand(P2, FINAL_SPARK, "spark");
}

function mixologistBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .legend(P1, HEART_OF_THE_TEMPEST, "hot")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC_MIXOLOGIST, "mixo")
    .trash(P1, LEGION_REARGUARD, "rg")
    .hand(P2, FINAL_SPARK, "spark");
}

/** P2 Final-Sparks `victim`; both pass so it resolves and the victim dies (Deathknell becomes pending). */
async function kill(game: Game, victim: string): Promise<void> {
  await game.p2.cast("spark", { targets: victim });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(victim)).toBe("trash");
}

/** Herald: kill it, pass through the Deathknell's priority window, land on P1's "which hand unit" prompt. */
async function heraldToUnitPrompt(game: Game): Promise<void> {
  await kill(game, "herald");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
}

/** Mixologist: kill it, accept the "You may" at finalization, pass priority, land on the "which trash unit" prompt. */
async function mixologistToUnitPrompt(game: Game): Promise<void> {
  await kill(game, "mixo");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
}

/** Answer the Accelerate question if (and only if) it is being asked. */
async function answerAccelerate(game: Game, pay: boolean): Promise<boolean> {
  const d = game.decision();
  if (d?.kind !== "yes-no" || d.seat !== P1) {
    return false;
  }
  expect(d.prompt).toMatch(/Legion Rearguard/);
  await (pay ? game.p1.yes() : game.p1.no());
  return true;
}

describe("Case A — Rift Herald's Deathknell plays Legion Rearguard FROM HAND (P2's turn)", () => {
  test("(1) the hand unit is offered on resolution with a legal DECLINE (128.6: private zone + 'a unit'); declining leaves Rearguard in hand, nothing paid, back to P2's main phase", async () => {
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    const d = game.decision();
    expect(d?.kind === "pick" && d.options.map((o) => o.card ?? o.key)).toEqual(["rg"]);
    expect(d?.kind === "pick" && d.allowDecline).toBe(true);
    await game.p1.decline();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("rg")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(2) no location choice: even though bf1 is still P1's while the Deathknell resolves, no destination is asked and Rearguard lands in P1's BASE (419.3.b 'to your base')", async () => {
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Closed state — control not yet lost (309.1, 323.6)
    await game.p1.pick("rg");
    const next = game.decision();
    // The only thing that may follow is the Accelerate question — never a destination pick.
    expect(next?.kind === "pick" && next.semantics === "destination").toBe(false);
    if (next?.kind === "pick") {
      expect(next.options.map((o) => o.key)).not.toContain("battlefield-bf1");
    }
    await answerAccelerate(game, false);
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("(3)(4) Accelerate is still offered and payable with [1][fury] in pool; paying it → Rearguard enters READY and the fury pip is spent (355.1.a, 356.1.b.3, 805.6)", async () => {
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    await game.p1.pick("rg");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(await answerAccelerate(game, true)).toBe(true);
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("rg").isReady).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("(3) Accelerate's [1] ENERGY is also paid — only the BASE Energy cost is ignored (356.1.b.2/.3)", async () => {
    // pool {energy 1, fury 1} → {energy 0, fury 0} after paying Accelerate on the free-energy play.
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    await game.p1.pick("rg");
    await answerAccelerate(game, true);
    await game.settle();
    expect(game.state("rg").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(3)(4) declining Accelerate: Rearguard enters EXHAUSTED (143.4); its printed 2 energy was ignored (P1 only ever had 1) and it has no Power cost → pool untouched", async () => {
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    await game.p1.pick("rg");
    await answerAccelerate(game, false);
    await game.settle();
    expect(game.state("rg")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("(5) NO empower: the unit was played BY an effect but FROM HAND — Heart of the Tempest never triggers (origin zone is what counts)", async () => {
    const game = await heraldBoard().build();
    await heraldToUnitPrompt(game);
    await game.p1.pick("rg");
    await answerAccelerate(game, false);
    expect(game.chain().some((c) => c.cardId === "hot")).toBe(false);
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("(6) it is P2's turn throughout: the Deathknell and the play are P1's (191.1/191.3) — P1 answers every prompt, controls Rearguard, and P2 gets their open main phase back", async () => {
    const game = await heraldBoard().build();
    expect(game.turnPlayer()).toBe(P2);
    await heraldToUnitPrompt(game);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.pick("rg");
    await answerAccelerate(game, true);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("rg")).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — Glasc Mixologist's Deathknell plays Legion Rearguard FROM TRASH (P2's turn)", () => {
  test("(1) optional by its own 'You may': asked at finalization; NO → nothing is played, Rearguard stays in the trash, P2's main phase resumes", async () => {
    const game = await mixologistBoard().build();
    await kill(game, "mixo");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("rg")).toBe("trash");
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(2) P1 chooses the location: base OR bf1 — the battlefield where Mixologist just died is still P1's in the Closed state (355.2.a, 309.1, 323.6) — and Rearguard can land there, keeping control", async () => {
    const game = await mixologistBoard().build();
    await mixologistToUnitPrompt(game);
    const d = game.decision();
    expect(d?.kind === "pick" && d.options.map((o) => o.card ?? o.key)).toEqual(["rg"]);
    await game.p1.pick("rg");
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(dest?.kind === "pick" && dest.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.answer("battlefield-bf1");
    await answerAccelerate(game, false);
    await game.settle();
    expect(game.locationOf("rg")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(3)(4) 'ignoring its cost' zeroes Energy AND Power (356.1.b.1) yet Accelerate is still payable on top (356.1.b.3): pay [1][fury] → pool {0,0}, Rearguard enters READY", async () => {
    const game = await mixologistBoard().build();
    await mixologistToUnitPrompt(game);
    await game.p1.pick("rg");
    await game.p1.answer("base");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(await answerAccelerate(game, true)).toBe(true);
    await game.settle();
    expect(game.state("rg")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(3)(4) declining Accelerate: enters EXHAUSTED and nothing at all is paid", async () => {
    const game = await mixologistBoard().build();
    await mixologistToUnitPrompt(game);
    await game.p1.pick("rg");
    await game.p1.answer("base");
    await answerAccelerate(game, false);
    await game.settle();
    expect(game.state("rg")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("(5) YES empower: the unit came trash → board, so once its play completes Heart of the Tempest's trigger goes on the chain (419.4.a) and the legend ends up Empowered", async () => {
    const game = await mixologistBoard().build();
    await mixologistToUnitPrompt(game);
    await game.p1.pick("rg");
    await game.p1.answer("base");
    await answerAccelerate(game, false);
    // The play has completed → the legend's trigger is now the pending chain item, controlled by P1.
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hot", controller: P1, triggered: true })]);
    expect(game.state("hot").isEmpowered).toBe(false); // not yet — only on resolution
    await game.settle();
    expect(game.state("hot").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(6) P2's turn does not matter: P1 makes every choice, controls Rearguard (191.1/191.3), and P2's open main phase resumes afterwards", async () => {
    const game = await mixologistBoard().build();
    expect(game.turnPlayer()).toBe(P2);
    await mixologistToUnitPrompt(game);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.pick("rg");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.answer("battlefield-bf1");
    await answerAccelerate(game, true);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("rg")).toMatchObject({ controller: P1, isReady: true, owner: P1, zone: "battlefield-bf1" });
    expect(game.state("hot").isEmpowered).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
