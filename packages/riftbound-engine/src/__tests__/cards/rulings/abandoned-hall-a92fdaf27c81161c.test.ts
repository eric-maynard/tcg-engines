/**
 * Ruling a92fdaf27c81161c — Abandoned Hall (unl-205-219)
 *   Battlefield: "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *   × Arcane Shift (sfd-200-221) · Action spell · 3 + [rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *      battlefield. Banish this."
 *
 * Q: Can a unit that a spell (Arcane Shift / Thrill of the Hunt) re-plays to Abandoned Hall be chosen by
 *    Abandoned Hall's "plays a spell" trigger for the +1 Might?
 * A: Yes. The replayed unit is appended to the chain as a pending item during the spell's resolution
 *    (354.2/354.3); the Hall trigger only becomes pending after the spell has fully resolved (350.1,
 *    419.4.a, 383.2.c) — i.e. AFTER the unit. Pending items finalize in append order (337.1.b), so the
 *    unit lands at the Hall first (337.2) and is a valid choice when the trigger's target is picked.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const ARCANE_SHIFT = "sfd-200-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls Abandoned Hall (live abilities) with a lone 3-Might "guard" there; P2 has a
 * 5-Might unit at bf2 to soak Arcane Shift's 3 damage. P1 has exactly 3 + [rainbow] for the spell.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "hall", { might: 3, name: "Hall Guard" }, "guard")
    .unit(P2, "bf2", { might: 5, name: "Victim" }, "victim")
    .hand(P1, ARCANE_SHIFT, "shift");
}

/** Cast Arcane Shift on [guard, victim] and pass until the first real prompt. */
async function shiftGuard(game: Game) {
  await game.p1.cast("shift", { targets: ["guard", "victim"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["shift"]);
  // While Arcane Shift merely sits on the chain, the Hall trigger has NOT fired yet (it keys off the
  // spell being fully played, 419.4.a) — nothing triggered is on the chain.
  expect(game.chain().filter((c) => c.triggered)).toEqual([]);
  const r = await game.settle();
  return r.decision;
}

describe("Ruling a92fdaf27c81161c — Abandoned Hall can buff a unit a spell just re-played there", () => {
  test("sequence: Arcane Shift fully resolves (3 damage dealt, itself banished) and the replayed unit's destination is asked BEFORE any Abandoned Hall choice (354.3, 337.1.b)", async () => {
    const game = await board().build();
    const d = await shiftGuard(game);
    // First prompt = where the OWNER (P1) plays the banished guard.
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-hall");
    // Arcane Shift is done: damage dealt, spell banished, guard currently banished awaiting its play.
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.zoneOf("guard")).toBe("banishment");
    // The Hall trigger is pending behind the unit (appended after it) — it has not asked anything yet.
    expect(game.chain().some((c) => c.cardId === "hall" && c.triggered)).toBe(true);
  });

  test("the unit is finalized and placed at Abandoned Hall first; only then does the Hall trigger ask — and the replayed guard is a legal choice that ends at 4 Might this turn (337.2, 383.2.c)", async () => {
    const game = await board().build();
    await shiftGuard(game);
    await game.p1.pick("battlefield-hall");
    // The guard is on the board at the Hall before the trigger's "you may" is even asked.
    expect(game.zoneOf("guard")).toBe("battlefield-hall");
    expect(game.chain().some((c) => c.cardId === "hall" && c.triggered)).toBe(true); // trigger still waiting
    // rule 383.3.a / 402.1: the Hall trigger is finalized now — its "you may" is asked before anyone passes.
    expect(game.zoneOf("guard")).toBe("battlefield-hall");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("Abandoned Hall");
    await game.p1.yes();
    // Target choice: either an explicit pick that includes the guard, or (sole unit here) auto-applied.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "guard")) {
      await game.p1.pick("guard");
    }
    await game.settle(); // both pass on the finalized Hall trigger → it resolves
    expect(game.state("guard").might).toBe(4); // 3 printed + 1 from Abandoned Hall
    expect(game.state("guard").damage).toBe(0); // replayed as a fresh object
  });

  test("Arcane Shift is ONE spell played by ONE player → exactly one Abandoned Hall trigger: after it resolves the guard is 4 Might and P1 is back in an open main phase", async () => {
    const game = await board().build();
    await shiftGuard(game);
    expect(game.chain().filter((c) => c.cardId === "hall" && c.triggered)).toHaveLength(1);
    await game.p1.pick("battlefield-hall");
    await game.settle();
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "guard")) {
      await game.p1.pick("guard");
    }
    await game.settle({ policy: "first" }); // would accept any (wrong) extra trigger
    expect(game.state("guard").might).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test("the +1 Might lasts only this turn", async () => {
    const game = await board().build();
    await shiftGuard(game);
    await game.p1.pick("battlefield-hall");
    await game.settle();
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "guard")) {
      await game.p1.pick("guard");
    }
    await game.settle(); // rule 402: chosen at finalization, applied on resolution
    expect(game.state("guard").might).toBe(4);
    // Decline anything else this turn, then roll to P2's turn.
    game.script(P1, ["no", "no", "decline", "decline"]);
    await game.advanceTurn();
    expect(game.state("guard").might).toBe(3);
  });
});
