/**
 * Ruling 9653db2650cdd022 — Mischievous Marai (UNL-003 → unl-003-219) · Unit · Fury · 2 · 2 Might
 *   "[Hidden] When you play me to a battlefield, deal 2 to an enemy unit here."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: My opponent attacks and puts a "When I attack" trigger on the chain; I reveal Marai from Hidden as a Reaction. Does
 *    she stack on top of that existing chain or start a new one?
 * A: Same chain — there is only ever one. Hidden gives her Reaction timing, so she is played in the Closed State on top of
 *    the attack trigger and is dealt with first (LIFO); once she enters at that battlefield her own "deal 2" trigger also
 *    goes on that same chain, on top, and resolves before the opponent's attack trigger.
 * Rules: 330.1–330.2 (one Chain; anything played joins it), 811 (Hidden ⇒ play as a Reaction for [0]), 338 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MARAI = "unl-003-219";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P2's turn (turn 3). P1 holds bf1 with Guard (3) and Marai face down there. P2's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", MARAI, "marai")
    .unit(P2, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Yasuo attacks (his trigger auto-targets the lone Guard); P2 passes priority; P1 reveals Marai in that window. */
async function maraiRevealedOntoAttackTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("guard");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P2, targets: ["guard"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "marai")).toBe(true);
  expect(game.p1.energy()).toBe(0);
  await game.p1.reveal("marai");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("yasuo"); // her only enemy unit here
  }
  return game;
}

describe("Ruling 9653db2650cdd022 — Marai revealed as a Reaction joins the EXISTING chain, above the attack trigger", () => {
  test("Hidden ⇒ Reaction: with Yasuo's attack trigger pending and P1 holding priority, revealing Marai (for [0]) is legal; she enters bf1 and her 'deal 2 to an enemy unit here' trigger is added ON TOP of the same chain — no second chain", async () => {
    const game = await maraiRevealedOntoAttackTrigger();
    expect(game.state("marai")).toMatchObject({ isHidden: false, zone: "battlefield-bf1" });
    const items = game.chain();
    expect(items.map((c) => c.cardId)).toEqual(["yasuo", "marai"]);
    expect(items[1]).toMatchObject({ cardId: "marai", controller: P1, triggered: true });
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.state("guard").damage).toBe(0);
  });

  test("LIFO: Marai's trigger resolves FIRST — Yasuo takes 2 — while his attack trigger is still waiting underneath", async () => {
    const game = await maraiRevealedOntoAttackTrigger();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("yasuo").damage).toBe(2);
    expect(game.state("guard").damage).toBe(0);
  });

  test("then the opponent's attack trigger resolves last: 6 to the Guard (dies); Marai — a Defender now — stays to fight the showdown", async () => {
    const game = await maraiRevealedOntoAttackTrigger();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("marai")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", damage: 2 });
    expect(game.violations()).toEqual([]);
  });
});
