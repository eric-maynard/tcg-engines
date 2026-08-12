/**
 * Ruling 403615cb01e4995b — (general [Buff] stacking; no specific card)
 *   Stand-in: an inline [1] Action "Buff a friendly unit." cast twice at the same unit.
 *
 * Q: Can a unit have multiple buffs applied to it at the same time?
 * A: No — a unit holds at most ONE buff unless a card says otherwise. Buffing an already-buffed unit is
 *    still a legal thing to attempt (the spell resolves normally), it simply does nothing.
 * Rules: 701–702 (a Buff is +1 Might; a unit can have at most one), 426 (the Buff game action).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

/** Inline [1] Action: "Buff a friendly unit." */
const PEP_TALK = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Pep Talk",
  timing: "action",
};

/** P1's turn with [3] and two vanilla units in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P1, "base", { might: 2, name: "Mate" }, "mate")
    .hand(P1, PEP_TALK, "pep1")
    .hand(P1, PEP_TALK, "pep2");
}

/** First Pep Talk resolves on the Pal. */
async function buffedOnce(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pep1", { targets: "pal" });
  await game.settle();
  expect(game.zoneOf("pep1")).toBe("trash");
  expect(game.state("pal")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
  return game;
}

describe("Ruling 403615cb01e4995b — one buff at a time: a second buff on the same unit does nothing", () => {
  test("the second Pep Talk may still legally choose the already-buffed Pal — it is offered as a target", async () => {
    const game = await buffedOnce();
    const offered = (game.p1.option("cast", "pep2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("pal");
    expect(offered).toContain("mate");
  });

  test("casting it at the buffed Pal resolves normally (the spell is spent) but adds nothing: still exactly one buff, still 3 Might", async () => {
    const game = await buffedOnce();
    await game.p1.cast("pep2", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("pep2")).toBe("trash");
    expect(game.p1.energy()).toBe(1); // both spells were paid for
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 }); // NOT 4
    expect(game.violations()).toEqual([]);
  });

  test("control facet — the same second spell aimed at the UNbuffed Mate does buff it: 2 → 3", async () => {
    const game = await buffedOnce();
    await game.p1.cast("pep2", { targets: "mate" });
    await game.settle();
    expect(game.state("mate")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
  });
});
