/**
 * Ruling 509ea9e92a0ff184 — Vex, Apathetic (UNL-150 → unl-150-219) · Unit · Chaos · 4 · 4 Might · [Deflect]
 *   "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Irresistible Faefolk (UNL-112 → unl-112-219) · 1 Might · "When I move to a battlefield, you may move an
 *     enemy unit to that battlefield."
 *   × an [Ambush] unit (Nidalee, Cat Form — unl-114-219, 4 Might) played into the fight right after.
 *
 * Q: The opponent's Faefolk drags my Vex to a battlefield; if they then Ambush units in, are those stunned?
 * A: Yes. Vex triggers on ANY unit an opponent plays while Vex is at a battlefield, however it is played
 *    (Ambush/Reaction included): the unit enters, Vex's trigger goes on the chain and resolves — the unit is
 *    Stunned (deals no combat damage this turn) and can't be moved this turn.
 * Rules: 383 (trigger independence from how the unit was played), 423.1.b (stunned units deal no combat
 *        damage), Ambush (play as a Reaction to a battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX_APATHETIC = "unl-150-219";
const IRRESISTIBLE_FAEFOLK = "unl-112-219";
const NIDALEE_CAT_FORM = "unl-114-219";

/**
 * P2's turn. P1 holds bf1 with a 3-Might Guard; P1's Vex waits in P1's base. P2: Faefolk in base, Nidalee
 * (Ambush) in hand, [3] + body + a rainbow for Vex's Deflect.
 */
function board() {
  return scenario()
    // rule 355.10.d.2 — this file asserts the prompt a SOLE legal option still raises.
    .interactive()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { body: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", VEX_APATHETIC, "vex")
    .unit(P2, "base", IRRESISTIBLE_FAEFOLK, "faefolk")
    .hand(P2, NIDALEE_CAT_FORM, "nidalee");
}

/** Faefolk moves to bf1 and (P2 opting in, choosing Vex) drags Vex there; the trigger resolves. P2 then has Focus. */
async function vexDraggedToBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("faefolk", "bf1");
  // Faefolk's "you MAY move an enemy unit" is P2's opt-in, then P2's choice of which enemy unit.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("vex");
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("vex")).toBe("bf1");
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 509ea9e92a0ff184 — Vex dragged into a fight still stuns the opponent's Ambush plays", () => {
  test("preparation: Faefolk pulls Vex to bf1 (a combat is now open there) and P2 may Ambush Nidalee into bf1 as a Reaction", async () => {
    const game = await vexDraggedToBf1();
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.p2.can("play", "nidalee")).toBe(true);
    const where = game.p2.option("playUnit", "nidalee")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(where).toEqual(["battlefield-bf1"]); // Ambush: only where P2 has units
  });

  test("P2 Ambushes Nidalee into bf1: it enters, and Vex's trigger — controlled by P1 — goes on the chain; on resolution Nidalee is Stunned and gains 'can't move this turn'", async () => {
    const game = await vexDraggedToBf1();
    await game.p2.play("nidalee", { to: "bf1" });
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    expect(game.state("nidalee").isStunned).toBe(false); // not until the trigger resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("nidalee").isStunned).toBe(true);
    expect(game.state("nidalee").grantedKeywords).toEqual([{ duration: "turn", keyword: "NoMove", value: undefined }]);
    expect(game.p2.legal().some((o) => o.verb === "move")).toBe(false);
  });

  test("stun impact (423.1.b): in the ensuing combat the stunned 4-Might Nidalee contributes nothing — P2 deals only Faefolk's 1, both P2 units die to Guard 3 + Vex 4, and P1 keeps bf1", async () => {
    const game = await vexDraggedToBf1();
    await game.p2.play("nidalee", { to: "bf1" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("nidalee")).toBe("trash");
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.state("guard").damage + game.state("vex").damage).toBeLessThanOrEqual(1); // only Faefolk's 1 was dealt (healed at cleanup anyway)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
