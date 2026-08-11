/**
 * Interaction: Tail-Cloaked Matriarch (ven-104-166) · Unit · Chaos · 4 energy · 4 Might
 *     "[Empower] [2][chaos] ([2][chaos]: Empower me. Use only if not Empowered.)
 *      When I become [Empowered], you may choose a unit in your trash with Energy cost no more than [3] and Power
 *      cost no more than [rainbow]. Play it to your base, ignoring its cost."
 *   × Shakedown (ogn-033-298) · Spell · Fury · 2 + [fury] · [Reaction]
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Rules: 402.1 / 402.1.a (a trigger whose effect BEGINS with "you may" is accepted or declined by its controller as
 * it is finalized; declining removes it from the chain), 402.2 (every choice the ability needs — targets, modes,
 * anything else — is made in that same finalization step), 402.4 / 402.4.a (no legal choices ⇒ the item is removed
 * from the chain and that is explicitly NOT a counter), 355.5 (objects a card specifically chooses are chosen now),
 * 355.7 (a chosen object is a TARGET), 355.10.a / 355.10.a.1 (a trash is a PUBLIC zone, so "a unit in your trash"
 * IS a target — unlike "a unit from your hand"), 355.15 (those choices cannot be changed afterwards).
 *
 * Question. P1 controls an un-Empowered Matriarch in base and a 3-energy / 1-pip unit V at bf1. P1's trash holds
 * exactly one eligible unit T2 (2 energy, 1 pip) plus ineligible cards. P2 holds Shakedown. P1 activates
 * [Empower] [2][chaos]; the Matriarch becomes Empowered and the trigger goes on the chain.
 *   (a) When does the "you may" decision and the trash pick happen, and what is offered?
 *   (b) P1 says yes and picks T2; P2 responds with Shakedown killing V, which lands in P1's trash. On resolution may
 *       P1 switch to V, or add it?
 *   (c) If P1 had declined at finalization, can P1 change its mind once V dies?
 *   (d) If P1's trash held no eligible unit when the trigger finalized, what happens to the trigger — is it countered?
 *   (e) If V had already been killed before the Empower, is V in the option set?
 *
 * Expected. (a) BOTH at finalization of the triggered ability, before anyone gets priority on it: the effect begins
 * with "you may", so 402.1 has P1 decide there and then (declining removes the item, 402.1.a), and if P1 performs it
 * 402.2 requires every choice NOW. The trash is public (355.10.a / 355.10.a.1), so "a unit in your trash" is a target
 * (355.7) drawn from P1's trash only and filtered by printed Energy ≤ 3 and Power ≤ 1 pip — the option set is {T2}.
 * (b) No. The choice is locked (355.15): V entered the trash after finalization and was never a candidate, so it can
 * be neither substituted nor added. The trigger resolves and plays T2 to P1's base; V stays in the trash.
 * (c) No — a declined trigger has already left the chain (402.1.a) and nothing brings it back.
 * (d) With no eligible trash unit at finalization there are no legal choices, so the trigger is removed from the
 * chain (402.4) and that is explicitly NOT a counter (402.4.a); the Empower cost is still spent and the Matriarch is
 * still Empowered. (e) Yes — the option set is snapshotted at finalization, so a V killed BEFORE the Empower is
 * offered alongside T2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MATRIARCH = "ven-104-166";
const SHAKEDOWN = "ogn-033-298";

/** T2 — the one eligible unit in P1's trash: 2 energy, one pip. */
const T2 = { cardType: "unit", energyCost: 2, might: 2, name: "Trash Recruit", powerCost: ["chaos"] } as const;
/** V — 3 energy, one pip: eligible the moment it reaches a trash, and exactly on both caps. */
const V_DEF = { cardType: "unit", energyCost: 3, might: 3, name: "Vanguard V", powerCost: ["chaos"] } as const;
/** Ineligible trash filler: 4 energy is over the Energy cap; a spell is not a unit. */
const FOUR_DROP = { cardType: "unit", energyCost: 4, might: 4, name: "Four Drop" } as const;
const CHEAP_SPELL = { abilities: [], cardType: "spell", energyCost: 1, name: "Cheap Trick" } as const;
/** A free reaction kill, so P1 can put V in the trash itself after declining (case (c)). */
const KILL_SHOT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill Shot",
  timing: "reaction",
} as const;

/**
 * P1: Matriarch in base with exactly [2][chaos] (+1 spare energy so "ignoring its cost" is observable), V at bf1,
 * a trash holding only T2 as an eligible unit, and an eligible unit in P2's trash that must never be offered.
 * P2 holds Shakedown with the pool to cast it.
 */
function board() {
  return scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", MATRIARCH, "mat")
    .unit(P1, "bf1", V_DEF, "v")
    .trash(P1, T2, "t2")
    .trash(P1, FOUR_DROP, "four")
    .trash(P1, CHEAP_SPELL, "trick")
    .trash(P2, T2, "theirs")
    .hand(P2, SHAKEDOWN, "shake");
}

/** Activate [Empower] and let it resolve; stops at whatever the trigger's finalization asks. */
async function empower(game: Game): Promise<void> {
  await game.p1.activate("mat");
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Card ids offered by a `pick` decision. */
function offered(d: Decision | null): string[] {
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

describe("Tail-Cloaked Matriarch × Shakedown — the trash pick is locked at finalization, a later death cannot join it", () => {
  test("(a) the 'you may' is decided at FINALIZATION (402.1), before anyone gets priority on the trigger — and the Matriarch is already Empowered when it is asked", async () => {
    const game = await board().build();
    await empower(game);
    expect(game.state("mat").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mat", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  });

  // rule 402.2 / 355.7 / 355.10.a: the trash is a PUBLIC zone, so "a unit in your trash" is a TARGET and is named in
  // the same finalization step as the "you may" — a `pick` with timing FIN, before anyone holds priority.
  test("(a) the trash pick is a TARGET in a public zone and must be made at finalization too (402.2 / 355.10.a), not deferred to resolution", async () => {
    const game = await board().build();
    await empower(game);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(offered(game.decision())).toEqual(["t2"]);
  });

  test("(a) the option set is exactly the eligible unit in YOUR trash — T2; the 4-energy unit, the spell, the on-board V and the eligible unit in P2's trash are never offered", async () => {
    const game = await board().build();
    await empower(game);
    await game.p1.yes();
    expect(offered(game.decision())).toEqual(["t2"]);
  });

  // rule 355.15: the option set is snapshotted when the trigger is FINALIZED, while V is still alive at bf1 — only T2
  // is ever offered. A V that reaches the trash in response can be neither substituted for T2 nor added to the choice,
  // and nothing is re-asked as the item resolves: the pick made at finalization stands.
  test("(b) a unit that reaches the trash AFTER finalization does not join the choice (355.15) — the locked T2 still resolves and nothing is re-asked", async () => {
    const game = await board().build();
    await empower(game);
    await game.p1.yes();
    expect(offered(game.decision())).toEqual(["t2"]); // V is alive at bf1, so it is not a candidate
    await game.p1.pick("t2");
    await game.p1.passPriority();
    await game.p2.cast("shake", { targets: "v" });
    await game.settle();
    await game.p1.pick("1"); // Shakedown's "unless": P1 takes the 6 damage rather than giving P2 two cards
    await game.settle();
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("t2")).toBe("base"); // the locked pick, not the better body that arrived later
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) the trigger still resolves after the interruption: T2 is played to P1's base for free (the spare energy is untouched) and V stays in the trash", async () => {
    const game = await board().build();
    await empower(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    await game.p1.pick("t2"); // rule 402.2 — the target is named at finalization, before anyone holds priority
    await game.p1.passPriority();
    await game.p2.cast("shake", { targets: "v" });
    await game.settle();
    await game.p1.pick("1");
    await game.settle();
    expect(game.zoneOf("t2")).toBe("base");
    expect(game.state("t2")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) declining at finalization removes the trigger from the chain at once (402.1.a) — killing V afterwards brings nothing back", async () => {
    const game = await board().hand(P1, KILL_SHOT, "shot").build();
    await empower(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("shot", { targets: "v" });
    await game.settle();
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.base()).toEqual(["mat"]);
    expect(game.p1.trash().sort()).toEqual(["four", "shot", "t2", "trick", "v"]);
  });

  // Expected (402.4): with no eligible unit in the trash there are no legal choices to make for the trigger, so it is
  // removed from the chain during finalization — nothing is asked and no chain item survives. Actual: the engine
  // finalizes the item anyway (its trash choice is deferred to resolution, so finalization sees no target to fail on)
  // and raises an acceptable "you may" whose acceptance then does nothing.
  test("(d) a trigger with no legal choice is removed from the chain during finalization (402.4)", async () => {
    const game = await scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", MATRIARCH, "mat")
      .trash(P1, FOUR_DROP, "four")
      .trash(P1, CHEAP_SPELL, "trick")
      .trash(P2, T2, "theirs")
      .build();
    await empower(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d) removal is NOT a counter (402.4.a): the [2][chaos] stays spent, the Matriarch is still Empowered, and the trash is untouched", async () => {
    const game = await scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", MATRIARCH, "mat")
      .trash(P1, FOUR_DROP, "four")
      .trash(P1, CHEAP_SPELL, "trick")
      .trash(P2, T2, "theirs")
      .build();
    await empower(game);
    expect(game.state("mat").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    await game.settle({ policy: "first" });
    expect(game.p1.base()).toEqual(["mat"]);
    expect(game.p1.trash().sort()).toEqual(["four", "trick"]);
    expect(game.zoneOf("theirs")).toBe("trash"); // P2's eligible unit was never reachable
  });

  test("(e) a V killed BEFORE the Empower is in the option set — the snapshot is taken at finalization, so both T2 and V are offered", async () => {
    const game = await scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", MATRIARCH, "mat")
      .trash(P1, T2, "t2")
      .trash(P1, V_DEF, "v")
      .trash(P1, FOUR_DROP, "four")
      .trash(P2, T2, "theirs")
      .build();
    await empower(game);
    await game.p1.yes();
    await game.settle();
    expect(offered(game.decision())).toEqual(["t2", "v"]);
    await game.p1.pick("v");
    await game.settle();
    expect(game.zoneOf("v")).toBe("base");
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  });
});
