/**
 * Ruling b85ffb4a2d7bf9be — Fight or Flight (OGN-168 → ogn-168-298) × Vengeance (OGN-229 → ogn-229-298)
 *   Fight or Flight ([Hidden] [Action]): "Move a unit from a battlefield to its base."
 *   Vengeance ([4][order][order]): "Kill a unit."
 *
 * Q: Can a hidden Fight or Flight react to Vengeance and save the targeted unit?
 * A: No. Fight or Flight (played from hidden as a Reaction) resolves first and moves the unit to base, but Vengeance targets
 *    "a unit" with no location restriction, so the unit is still a legal target and is killed in its base. (Contrast: a
 *    "kill a unit at a battlefield" spell would mistarget.)
 * Rules: 355.12 / 359.3.f (re-check on resolution — only printed restrictions matter), 811 (Hidden → Reaction for [0]),
 *        336–340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const VENGEANCE = "ogn-229-298";
const HIDDEN_BLADE = "ogn-213-298"; // "[Action] Kill a unit at a battlefield. Its controller draws 2." — the location-restricted contrast

/** P1's turn with exactly Vengeance's [4][order][order]. P2 holds bf1 with a 3-Might Victim and Fight or Flight facedown there. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, VENGEANCE, "vengeance");
}

/** P1 casts `spell` on the Victim; P2 answers with the hidden Fight or Flight on the Victim. */
async function castAndRespond(game: Game, spell: string): Promise<void> {
  await game.p1.cast(spell, { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: spell, controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("victim");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual([spell, "fof"]);
  expect(game.p2.energy()).toBe(0); // played from hidden for [0]
}

describe("Ruling b85ffb4a2d7bf9be — hidden Fight or Flight cannot save a unit from Vengeance", () => {
  test("Fight or Flight resolves first and moves the Victim to P2's base while Vengeance is still on the chain", async () => {
    const game = await board().build();
    await castAndRespond(game, "vengeance");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("victim")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["vengeance"]);
  });

  test("Vengeance ('kill a unit' — no location) then resolves and kills the Victim in its base: the target stayed legal", async () => {
    const game = await board().build();
    await castAndRespond(game, "vengeance");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("vengeance")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a location-restricted kill (Hidden Blade: 'a unit AT A BATTLEFIELD') DOES mistarget after the same response: the Victim survives in base", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    await castAndRespond(game, "blade");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
