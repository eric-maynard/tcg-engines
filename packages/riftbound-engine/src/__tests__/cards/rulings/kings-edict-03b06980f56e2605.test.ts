/**
 * Ruling 03b06980f56e2605 — King's Edict (OGN-237 → ogn-237-298) · Action [6][order][order]
 *     "Starting with the next player, each other player chooses a unit you don't control that hasn't been chosen for this spell.
 *      Kill those units."   — cited as the NON-targeting contrast in a general Deflect question.
 *   Illustrated with Amateur Recital (unl-207-219, Battlefield "When you hold here, you may move a unit at a battlefield to its
 *   base.") and Jax, Unmatched (sfd-054-221, 5 Might, [Deflect]).
 *
 * Q: A battlefield says "you may choose a unit and send it to base" (enemy or friendly) — is that "choosing", so Deflect is owed?
 * A: If the ability has you select a specific unit as it goes on the chain, it TARGETS: choosing a Deflect unit imposes the
 *    mandatory Deflect cost, and if you can't pay it you can't choose that unit. "You may" doesn't change that. Effects whose
 *    choice is made at RESOLUTION by someone (King's Edict) or that hit everything don't target ⇒ no Deflect.
 * Rules: 355.10 (choosing an object to affect = targeting), 809.1.c–d (Deflect: mandatory additional cost to choose),
 *        356.2.a.2, 383.3.a/402.2 (a trigger's target is chosen at finalization), 355.16 (King's Edict-style choices).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINGS_EDICT = "ogn-237-298";
const AMATEUR_RECITAL = "unl-207-219";
const JAX = "sfd-054-221"; // [Deflect]

/**
 * End of P2's turn 2 → P1 holds Amateur Recital (Holder there). P2 has Jax (Deflect) and a plain Grunt at bf2.
 * P1's pool is empty at its Beginning Phase (pools empty at end of turn), so a Deflect surcharge is unpayable there.
 */
function recitalBoard(enemyBig: "jax" | "plain") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("recital", { controller: P1, def: AMATEUR_RECITAL, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "recital", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Grunt" }, "grunt");
  return enemyBig === "jax" ? s.unit(P2, "bf2", JAX, "big") : s.unit(P2, "bf2", { might: 5, name: "Big Plain" }, "big");
}

/** P2 ends the turn; P1's hold trigger at the Recital asks opt-in (FIN) → yes → the target pick (FIN). */
async function toRecitalTargetPick(enemyBig: "jax" | "plain"): Promise<{ game: Game; pick: PickDecision }> {
  const game = await recitalBoard(enemyBig).build();
  await game.p2.endTurn();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "recital" }, timing: "FIN" });
  await game.p1.yes(); // "you may" only decides whether the ability goes on the chain
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
  return { game, pick: d as PickDecision };
}

describe("Ruling 03b06980f56e2605 — a battlefield's 'you may choose a unit … to base' TARGETS (Deflect owed); King's Edict's resolution-time choice does not", () => {
  test("Amateur Recital targets as it goes on the chain: the unit is chosen at FINALIZATION, and a [Deflect] unit P1 cannot pay for is simply NOT choosable (Holder and the plain Grunt are)", async () => {
    const { game, pick } = await toRecitalTargetPick("jax");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing to pay Deflect with
    const offered = pick.options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toEqual(["grunt", "holder"]);
    expect(offered).not.toContain("big"); // Jax — Deflect unpayable ⇒ can't be chosen (809.1.d)
  });

  test("control — the same 5-Might enemy WITHOUT Deflect is offered: the omission above is the Deflect cost, not the unit", async () => {
    const { pick } = await toRecitalTargetPick("plain");
    expect(pick.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["big", "grunt", "holder"]);
  });

  test("choosing the Grunt binds it on the chain item; on resolution it is moved to its (P2's) base", async () => {
    const { game } = await toRecitalTargetPick("jax");
    await game.p1.pick("grunt");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "recital", controller: P1, targets: ["grunt"], triggered: true })]);
    expect(game.locationOf("grunt")).toBe("bf2");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("grunt")).toBe("base");
    expect(game.state("grunt").owner).toBe(P2);
    expect(game.locationOf("big")).toBe("bf2");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("King's Edict does NOT target: nothing chosen on the cast (no `targets` field, exactly [6][order][order] paid — no Deflect pip), and P2's choice of the Deflect Jax happens at RESOLUTION with no surcharge; Jax is killed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 3 } }) // one spare pip that must NOT be taken
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .unit(P2, "bf2", JAX, "jax")
      .unit(P2, "base", { might: 1, name: "Small" }, "small")
      .hand(P1, KINGS_EDICT, "edict")
      .build();
    expect(game.p1.option("cast", "edict")?.fields.some((f) => f.name === "targets")).toBe(false);
    await game.p1.cast("edict");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves → P2 chooses now
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, timing: "RES" });
    const jaxOpt = (d as PickDecision).options.find((o) => (o.card ?? o.key) === "jax");
    expect(jaxOpt).toBeDefined();
    expect(jaxOpt?.deflect ?? 0).toBe(0);
    await game.p2.pick("jax");
    await game.settle();
    expect(game.zoneOf("jax")).toBe("trash");
    expect(game.zoneOf("small")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } }); // still no Deflect charged to anyone
    expect(game.violations()).toEqual([]);
  });
});
