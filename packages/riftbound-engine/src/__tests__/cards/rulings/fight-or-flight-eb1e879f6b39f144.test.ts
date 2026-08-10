/**
 * Ruling eb1e879f6b39f144 — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] · 2 · "Move a unit from a
 *   battlefield to its base."
 *   × Charm (OGN-043 → ogn-043-298) · [Action] · 1+[calm] · "Move an enemy unit."
 *
 * Q: Charm targets a unit to move it to base; in response (from facedown) Fight or Flight moves that unit to base first.
 *    Does Charm still resolve, and what happens?
 * A: Charm's target AND destination are locked in when it is played. Fight or Flight resolves first and moves the unit
 *    to base; Charm then still RESOLVES but has no effect — the unit is already at the declared destination — and the
 *    destination cannot be re-chosen.
 * Rules: 355.4 (move destinations chosen at play time), 340 (LIFO), 359.3.e (an instruction that can't do anything is
 *        skipped; the spell still resolves), 811 (Hidden card played as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const CHARM = "ogn-043-298";

/**
 * P1's turn 3 with exactly 1+[calm]. P2 holds bf1 with X (3) and a Holder (2), and has Fight or Flight facedown there
 * (hidden on an earlier turn). P1 holds bf2 with a unit of its own (so "battlefield-bf2" is a rival destination).
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "X" }, "x")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, CHARM, "charm");
}

/** P1 casts Charm on X and — asked right away, before anyone gets priority — declares BASE as the destination. */
async function charmXToBase(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "x" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // 355.4 — destination is part of playing the spell
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf2"]);
  await game.p1.pick("base");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["x"] })]);
  expect(game.locationOf("x")).toBe("bf1");
  return game;
}

/** P1 passes; P2 flips Fight or Flight for [0] naming X. */
async function fofInResponse(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof", { answers: ["x"] });
  expect(game.p2.energy()).toBe(0); // played from Hidden for [0]
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "fof"]);
}

describe("Ruling eb1e879f6b39f144 — Fight or Flight pre-empts Charm; Charm still resolves but does nothing", () => {
  test("Charm locks target X and destination BASE at play time; P2 responds with the hidden Fight or Flight on X", async () => {
    const game = await charmXToBase();
    await fofInResponse(game);
  });

  test("LIFO: Fight or Flight resolves first and moves X to P2's base while Charm is still on the chain — and no new destination prompt is offered for Charm", async () => {
    const game = await charmXToBase();
    await fofInResponse(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item (FoF) resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("x")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // just priority — nothing to re-choose
    expect(game.decision()?.kind).not.toBe("pick");
  });

  test("Charm then RESOLVES (goes to the trash as a resolved spell, cost spent) with no effect: X simply stays in base; Holder and everything else untouched", async () => {
    const game = await charmXToBase();
    await fofInResponse(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 0, location: "base", zone: "base" });
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.locationOf("mine")).toBe("bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no response): Charm alone moves X from bf1 to base", async () => {
    const game = await charmXToBase();
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("x")).toBe("base");
    expect(game.zoneOf("fof")).toBe("facedown-bf1");
  });
});
