/**
 * Ruling 0baa3c9c064aa1dc — Back Off (UNL-042 → unl-042-219) · Spell · Calm · 3 · Hidden / Action
 *   "[Stun] a unit. If you played this from your hand, draw 1."
 *   × Vex, Mocking (UNL-055 → unl-055-219) · 5 Might · "When you [Stun] an enemy unit at a battlefield, you may
 *     move me to that battlefield."
 *   × Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] When an opponent plays a unit while I'm at a
 *     battlefield, [Stun] it. They can't move it this turn."
 *
 * Q: I Back Off an enemy unit at a battlefield. Can I move Vex, Mocking (from another battlefield) AND Vex,
 *    Apathetic (from base) to that battlefield in the same movement?
 * A: No. The stun triggers Vex, Mocking's ability, which goes on the chain and (if accepted) moves only her.
 *    Vex, Apathetic has no such trigger and does not move (she needs an ordinary Standard Move). Even several
 *    Vex, Mocking would each be a separate chain item resolving one by one (LIFO), not one simultaneous move.
 * Rules: 376 / 383 (triggered abilities → chain items, one each), 383.3.d (controller orders simultaneous
 *        triggers), 336–340 (LIFO resolution), 144 (Standard Move), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_OFF = "unl-042-219";
const VEX_MOCKING = "unl-055-219";
const VEX_APATHETIC = "unl-150-219";

/**
 * P1's turn. P2 holds bf1 with a 3-Might Foe. P1 holds bf2 with Vex, Mocking; Vex, Apathetic sits in P1's base;
 * Back Off in hand with exactly 3 energy. `twoMocking` adds a second Vex, Mocking in P1's base.
 */
function board(twoMocking = false) {
  const s = scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "bf2", VEX_MOCKING, "vexm")
    .unit(P1, "base", VEX_APATHETIC, "vexa")
    .hand(P1, BACK_OFF, "backoff");
  return twoMocking ? s.unit(P1, "base", VEX_MOCKING, "vexm2") : s;
}

/** Cast Back Off from hand at the Foe and pass priority around so it resolves (stun + draw). */
async function backOffTheFoe(game: Game): Promise<void> {
  const hand0 = game.p1.hand().length;
  await game.p1.cast("backoff", { targets: "foe" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "backoff", controller: P1, targets: ["foe"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("backoff")).toBe("trash");
  expect(game.state("foe").isStunned).toBe(true);
  expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // played from hand → drew 1
}

/** Accept every "Use Vex, Mocking's optional ability?" opt-in P1 is asked (bounded); returns the sources asked about. */
async function acceptMockingOptIns(game: Game): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "yes-no" || d.seat !== P1) {
      break;
    }
    asked.push(d.source?.cardId ?? "?");
    await game.p1.yes();
  }
  return asked;
}

/** Pass priority until the chain shrinks by one item. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).pass();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 0baa3c9c064aa1dc — Back Off's stun moves Vex, Mocking via her own trigger; Vex, Apathetic does not come along", () => {
  test("stunning the Foe triggers ONLY Vex, Mocking: P1 is offered her 'you may move me' (a chain item from vexm); nothing triggers from Vex, Apathetic", async () => {
    const game = await board().build();
    await backOffTheFoe(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "vexm" } });
    const asked = await acceptMockingOptIns(game);
    expect(asked).toEqual(["vexm"]);
    await game.acceptTriggerOrder();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vexm", controller: P1, triggered: true })]);
    expect(game.chain().map((c) => c.cardId)).not.toContain("vexa");
    // Nothing has moved yet — the move happens when the trigger RESOLVES.
    expect(game.locationOf("vexm")).toBe("bf2");
    expect(game.locationOf("vexa")).toBe("base");
  });

  test("the trigger resolves: Vex, Mocking moves bf2 → bf1 (to the stunned Foe); Vex, Apathetic is still in base", async () => {
    const game = await board().build();
    await backOffTheFoe(game);
    await acceptMockingOptIns(game);
    await game.acceptTriggerOrder();
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("vexm")).toBe("bf1");
    expect(game.locationOf("vexa")).toBe("base");
    expect(game.cardsAt("bf1").sort()).toEqual(["foe", "vexm"]);
  });

  test("Vex, Apathetic gets there only by an ordinary Standard Move in the open main phase afterwards (here: after Vex, Mocking's combat took bf1)", async () => {
    const game = await board().build();
    await backOffTheFoe(game);
    await acceptMockingOptIns(game);
    await game.settle(); // trigger resolves, Vex arrives, combat vs the stunned Foe (deals no damage) resolves
    expect(game.locationOf("vexm")).toBe("bf1");
    expect(game.zoneOf("foe")).toBe("trash"); // 5 vs a stunned 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("vexa")).toBe("base"); // still — no effect ever moved her
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.option("standardMove:to:bf1")).toBeDefined();
    await game.p1.move("vexa", "bf1");
    expect(game.locationOf("vexa")).toBe("bf1");
    expect(game.state("vexa").isExhausted).toBe(true); // a real Standard Move (exhausts), not a free effect-move
  });

  test("two Vex, Mocking: each puts her OWN item on the chain (P1 is offered to order them), and they resolve one at a time — after the first resolves exactly one Vex has arrived", async () => {
    const game = await board(true).build();
    await backOffTheFoe(game);
    const asked = await acceptMockingOptIns(game);
    expect(asked.sort()).toEqual(["vexm", "vexm2"]);
    // rule 383.3.d — simultaneous triggers of one controller: that controller orders them.
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.acceptTriggerOrder();
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["vexm", "vexm2"]);
    expect(game.chain().map((c) => c.cardId)).not.toContain("vexa");
    // LIFO, one by one: after the top item resolves exactly one of them is at bf1.
    await resolveTop(game);
    const atBf1AfterFirst = ["vexm", "vexm2"].filter((v) => game.locationOf(v) === "bf1");
    expect(atBf1AfterFirst).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    await resolveTop(game);
    expect(game.locationOf("vexm")).toBe("bf1");
    expect(game.locationOf("vexm2")).toBe("bf1");
    expect(game.locationOf("vexa")).toBe("base");
  });
});
