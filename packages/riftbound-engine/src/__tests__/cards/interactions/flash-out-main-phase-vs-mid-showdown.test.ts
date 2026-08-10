/**
 * Interaction: Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2 + [order] · "[Hidden] [Action] Kill a unit at a
 *     battlefield. Its controller draws 2."  — hidden facedown at battlefield A on an earlier turn
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · "[Shield]"  — P1's lone unit holding A
 *   vs P2's vanilla 4-Might unit Z.
 *
 * Question: P1 controls A with a lone Poro + a facedown Hidden Blade. Case 1: on P1's own turn (Neutral
 * Open) P1 Flashes the Poro to base. Case 2: on P2's turn Z standard-moves into A; inside the resulting
 * combat showdown P1 Flashes the Poro to base. When does P1 lose A, to whom, what happens to the facedown
 * Blade, and in Case 2 can P1 still flip the Blade later in that same showdown to kill Z? State of A after
 * each Cleanup?
 *
 * Rules: 323.6 (lose an unoccupied battlefield only in an Open State with no Showdown/Combat there), 323.7
 * (Hidden cards at a battlefield their controller no longer controls → owner's trash), 190.2/190.2.b
 * (control is binary/per player — losing it makes A UNcontrolled, not P2's), 190.3.b (Contested stays until
 * control is (re)established), 190.4.b/190.4.c (no control change during an ongoing Combat/Showdown),
 * 323.2.c (a designated unit no longer at the combat battlefield loses its designation), 465.1 (damage
 * step needs both sides), 466.3.d (neither side has units → No Result), 466.5 (survivor establishes
 * control → Conquer), 466.5.a (clear Contested), 466.5.b (nobody left → Uncontrolled), 466.5.c (remove
 * foreign Hidden cards), 811.1.d.2 (a hidden spell picks its target at THAT battlefield).
 *
 * Expected:
 *  Case 1 — Flash resolves, Cleanup in an Open State: P1 loses A at once; A is uncontrolled (not P2's);
 *    the facedown Blade goes to P1's trash; nothing contested/staged. (P1 could have flipped the Blade in
 *    response to its own Flash — that was the last window.)
 *  Case 2 — mid-showdown: after Flash the Cleanup finds a Combat at A → P1 STILL controls A, A stays
 *    Contested by P2, the Poro loses Defender, the Blade stays facedown (A is still P1's). P1 may later in
 *    the same showdown flip the Blade for 0 choosing Z. 2a (no flip): no damage step; P2 alone remains →
 *    P2 conquers A (+1), Contested cleared, Blade removed to P1's trash. 2b (flip kills Z, P2 draws 2):
 *    nobody remains → No Result, A becomes uncontrolled, Contested cleared, Blade (played) in trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const HIDDEN_BLADE = "ogn-213-298";
const STALWART_PORO = "ogn-052-298";

/**
 * Turn 3. P1 controls A with a lone Stalwart Poro and a Hidden Blade hidden there on an earlier turn; P1
 * holds Flash with exactly its 2 energy. P2 controls B (irrelevant) and has vanilla 4-Might Z in base.
 * `activeSeat` = whose turn it is (Case 1: P1, Case 2: P2).
 */
function board(activeSeat: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(activeSeat)
    .resources(P1, { energy: 2 })
    .battlefield("A", { controller: P1 })
    .battlefield("B", { controller: P2 })
    .unit(P2, "B", { might: 1, name: "B Holder" }, "bh") // rule 190.4.a — B stays P2's only with a P2 unit on it
    .unit(P1, "A", STALWART_PORO, "poro")
    .facedown(P1, "A", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 4, name: "Zed Vanilla" }, "Z")
    .hand(P1, FLASH, "flash");
}

const bfA = (game: Game) => game.gameState.battlefields.A;
/** The active showdown frame, if any. */
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Case 2 up to "Flash has resolved inside the showdown": Z moves in, P2 passes Focus, P1 Flashes the Poro, both pass. */
async function flashOutMidShowdown(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("Z", "A");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "A", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
  await game.p2.passFocus();
  expect(game.p1.can("cast", "flash")).toBe(true);
  await game.p1.cast("flash", { targets: "poro" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["poro"] })]);
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.zoneOf("flash")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

/** From the post-Flash showdown: pass Focus around to P1 and flip the facedown Blade at Z (the only unit at A). */
async function flipBladeAtZ(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
    await game.acting().passFocus();
  }
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade");
  // 811.1.d.2: the target is chosen from units at A — Z is the only one, so it is either asked or locked.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["Z"]);
    await game.p1.pick("Z");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1 })]);
  expect(game.p1.energy()).toBe(0); // Flash took the 2; the flip cost nothing
}

describe("Flash out of your own battlefield: Main Phase (Open) vs mid-showdown (Closed to control changes)", () => {
  // ---- Case 1: P1's own turn, Neutral Open ------------------------------------------------------------

  test("Case 1: Flash offers the Poro, costs 2, and while it sits on the chain P1 may still flip the facedown Blade (its last window)", async () => {
    const game = await board(P1).build();
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: "poro" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", targets: ["poro"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    expect(game.zoneOf("blade")).toBe("facedown-A");
  });

  test("Case 1: Flash resolves → Poro in base; the Open-State Cleanup strips P1's control of the now-empty A immediately (323.6)", async () => {
    const game = await board(P1).build();
    await game.p1.cast("flash", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(bfA(game)?.controller).not.toBe(P1);
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
  });

  test("Case 1: A becomes UNCONTROLLED — not P2's (190.2.b); nothing contested, no showdown/combat staged", async () => {
    const game = await board(P1).build();
    await game.p1.cast("flash", { targets: "poro" });
    await game.settle();
    expect(bfA(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p2.battlefields({ controlled: true })).toEqual(["B"]);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // still P1's open main phase
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("Case 1: the facedown Hidden Blade is at a battlefield P1 no longer controls → put in P1's trash by the same Cleanup (323.7)", async () => {
    const game = await board(P1).build();
    await game.p1.cast("flash", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toContain("blade");
    expect(game.p1.facedown("A")).toEqual([]);
    expect(game.p1.can("reveal", "blade")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ---- Case 2: P2's turn, inside the combat showdown at A ---------------------------------------------

  test("Case 2: Z's arrival makes A Contested BY P2 and opens a combat showdown — P2 Attacker with Focus, Poro Defender; P1 cannot act until Focus is passed", async () => {
    const game = await board(P2).build();
    await game.p2.move("Z", "A");
    expect(bfA(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("Z").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "flash")).toBe(false);
    expect(game.p1.can("reveal", "blade")).toBe(false);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "flash")).toBe(true);
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("Case 2: after Flash resolves mid-showdown P1 STILL controls A — a Combat is ongoing there, so 323.6 does not apply and 190.4.b forbids the change; A stays Contested by P2 (190.3.b)", async () => {
    const game = await flashOutMidShowdown();
    expect(game.zoneOf("poro")).toBe("base");
    expect(bfA(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.p1.units("A")).toEqual([]);
    expect(game.p2.units("A")).toEqual(["Z"]);
  });

  test("Case 2: the showdown/combat is still ongoing with attackers only — the Poro lost its Defender designation (323.2.c), Z is still the Attacker", async () => {
    const game = await flashOutMidShowdown();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "A", isCombatShowdown: true });
    expect(game.state("poro").combatRole).not.toBe("defender");
    expect(game.state("Z").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.points()).toBe(0); // nothing scored yet — control changes wait for the combat's own steps
  });

  test("Case 2: the facedown Hidden Blade STAYS — A is still controlled by P1, so 323.7 has nothing to remove", async () => {
    const game = await flashOutMidShowdown();
    expect(game.zoneOf("blade")).toBe("facedown-A");
    expect(game.p1.facedown("A")).toEqual(["blade"]);
    expect(bfA(game)?.controller).toBe(P1);
  });

  test("Case 2: because A is still P1's, P1 may later in the SAME showdown flip Hidden Blade for [0] choosing Z, a unit 'here' (811.1.d.2)", async () => {
    const game = await flashOutMidShowdown();
    await flipBladeAtZ(game);
    expect(game.zoneOf("blade")).toBe("chain");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "A" });
  });

  // ---- Branch 2a: P1 does not flip -----------------------------------------------------------------------

  test("Branch 2a (no flip): the showdown closes with no damage step (465.1); only P2 has units → P2 establishes control of A → Conquer, +1 (466.5, 466.5.d)", async () => {
    const game = await flashOutMidShowdown();
    await game.settle(); // everyone passes Focus
    expect(showdown(game)).toBeUndefined();
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(game.zoneOf("Z")).toBe("battlefield-A");
    expect(game.state("Z").damage).toBe(0);
    expect(bfA(game)?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("Branch 2a: final state of A — controller P2 / contested false / nothing staged; P1's facedown Blade is removed to P1's trash (466.5.a, 466.5.c); Poro safe in base", async () => {
    const game = await flashOutMidShowdown();
    await game.settle();
    expect(bfA(game)).toMatchObject({ contested: false, controller: P2 });
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toContain("blade");
    expect(game.p1.facedown("A")).toEqual([]);
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").damage).toBe(0);
    expect(game.state("Z").combatRole).not.toBe("attacker"); // 466.7.a designations removed
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 }); // back to P2's open turn
    expect(game.violations()).toEqual([]);
  });

  // ---- Branch 2b: P1 flips Hidden Blade and kills Z --------------------------------------------------------

  test("Branch 2b (flip): Hidden Blade resolves — Z is killed and ITS controller P2 draws 2; the Blade goes to P1's trash having cost nothing", async () => {
    const game = await flashOutMidShowdown();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await flipBladeAtZ(game);
    await game.settle();
    expect(game.zoneOf("Z")).toBe("trash");
    expect(game.p2.trash()).toContain("Z");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toContain("blade");
  });

  test("Branch 2b: at resolution neither player has units at A → 'No Result' (466.3.d); A becomes UNCONTROLLED — P1 does not keep it for having defended (466.5.b) — Contested cleared, nothing staged, nobody scores", async () => {
    const game = await flashOutMidShowdown();
    await flipBladeAtZ(game);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(bfA(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.units("A")).toEqual([]);
    expect(game.p2.units("A")).toEqual([]);
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual(["B"]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
