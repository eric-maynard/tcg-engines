/**
 * Ruling 80fcf680f9bfa6ec — Bone Skewer (UNL-139 → unl-139-219) · Spell · Chaos · [2][chaos] · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to
 *      that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Rengar, Unseen (UNL-024 → unl-024-219) · 4 Might · "[Accelerate] [Assault 2] [Deflect] (Opponents must pay
 *     [rainbow] to choose me with a spell or ability.)"
 *
 * Q: Do I have to pay the [Deflect] cost when picking Rengar out of the opponent's hand with Bone Skewer?
 * A: No. Cards in hand are not permanents, and [Deflect] only taxes choosing the permanent on the board. Nor does
 *    the follow-up [Stun] cost anything: it is applied programmatically to the unit that was just played, it does
 *    not choose it.
 * Rules: 809.1.c ([Deflect] taxes choosing THAT object — a permanent on the board), 110 (cards in hand are not
 *        permanents), 355.10.d (a programmatic selection is not a choice, so no Deflect surcharge).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const RENGAR = "unl-024-219";
const SKULKER = "ogn-175-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P1 holds bf1 with a body, has Bone Skewer + [2][chaos] and TWO spare [rainbow] to prove none is taken. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P2, RENGAR, "rengar")
    .hand(P2, SKULKER, "plain")
    .hand(P1, BONE_SKEWER, "skewer");
}

/** P2 declines Rengar's [Accelerate] offer if it comes up as he enters. */
async function declineAccelerate(game: Game): Promise<void> {
  if (game.decision()?.kind === "yes-no" && game.decision()?.seat === P2) {
    await game.p2.no();
  }
}

/** Cast Bone Skewer naming bf1 and let it resolve to the reveal-and-pick. */
async function skewerToPick(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("skewer", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 2 } }); // base cost only
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 80fcf680f9bfa6ec — no [Deflect] tax for a card taken out of hand, nor for the delayed [Stun]", () => {
  test("P2's hand is revealed and P1 may choose from it — the [Deflect] Rengar is offered with NO surcharge attached", async () => {
    const game = await skewerToPick();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const rengarOption = (d as PickDecision).options.find((o) => o.card === "rengar")!;
    expect(rengarOption).toBeDefined();
    expect(rengarOption.deflect ?? 0).toBe(0);
    expect(rengarOption.surcharge ?? 0).toBe(0);
    expect(rengarOption.needsAdd).toBeUndefined();
  });

  test("choosing him costs P1 nothing extra: the two spare [rainbow] are still in the pool afterwards", async () => {
    const game = await skewerToPick();
    await game.p1.pick("rengar");
    await declineAccelerate(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 2 } });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 2 } });
  });

  test("he arrives at the named battlefield under HIS controller, and the delayed [Stun] lands on him for free — it selects him programmatically, it does not choose him", async () => {
    const game = await skewerToPick();
    await game.p1.pick("rengar");
    await declineAccelerate(game);
    // Right after he is played (before the showdown his arrival opened is resolved):
    expect(game.state("rengar")).toMatchObject({ controller: P2, isStunned: true, zone: "battlefield-bf1" });
    expect(game.zoneOf("skewer")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — once he IS a permanent the tax bites: with no [rainbow] a spell cannot even name him, with one it can", async () => {
    const poor = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1, rainbow: 0 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RENGAR, "rengar")
      .unit(P2, "bf1", { might: 3, name: "Plain" }, "plain")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    const poorTargets = (poor.p1.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(poorTargets).toEqual(["plain"]); // Rengar unaffordable → dropped

    const rich = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RENGAR, "rengar")
      .unit(P2, "bf1", { might: 3, name: "Plain" }, "plain")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    const richTargets = (rich.p1.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(richTargets.toSorted()).toEqual(["plain", "rengar"]);
  });
});
