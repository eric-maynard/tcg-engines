/**
 * Ruling 83f1febc903523ce — Get Excited! (OGN-008 → ogn-008-298) · Spell · Fury · [2][fury] · [Action]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)"
 *
 * Q: When do you declare the target, and when does the opponent learn how much damage is coming?
 * A: The target is declared as Get Excited! is put on the chain. The discard happens on RESOLUTION, so while the
 *    opponent holds priority they know what is being shot at but not for how much; the amount is fixed only when
 *    the card is discarded, and the damage follows at once.
 * Rules: 355.9 (targets chosen as a spell is put on the chain), 359.3 (instructions are carried out on
 *        resolution), 359.3.e.13 (the discarded card's cost is read then).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const SKY_SPLITTER = "ogn-014-298"; // printed Energy cost 8
const HEXTECH_RAY = "ogn-009-298"; // printed Energy cost 1

/** P1's turn. P2 holds bf1 with a 9-Might Ogre; P1 has Get Excited! + [2][fury] and two very different discards. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Ogre" }, "ogre")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, GET_EXCITED, "excited")
    .hand(P1, SKY_SPLITTER, "big")
    .hand(P1, HEXTECH_RAY, "small");
}

/** Cast Get Excited! at the Ogre and hand priority to P2. */
async function castAtOgre(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("excited", { targets: "ogre" });
  return game;
}

describe("Ruling 83f1febc903523ce — target on the chain, discard (and therefore the damage) on resolution", () => {
  test("the target is locked in as it goes on the chain — and only units at a battlefield were ever offered", async () => {
    const game = await board().build();
    const targets = (game.p1.option("cast", "excited")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["ogre"]); // the base-bound Homebody is not a legal choice
    await game.p1.cast("excited", { targets: "ogre" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "excited", controller: P1, targets: ["ogre"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("nothing is discarded yet while the opponent may respond: both candidates are still in hand, so the damage is unknowable", async () => {
    const game = await castAtOgre();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.hand().toSorted()).toEqual(["big", "small"]);
    expect(game.state("ogre").damage).toBe(0);
  });

  test("on resolution P1 is asked which card to discard — that decision comes at resolution time, not at play time", async () => {
    const game = await castAtOgre();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, timing: "RES" });
    expect((d as PickDecision).options.map((o) => o.card).toSorted()).toEqual(["big", "small"]);
  });

  test("discarding the [8] Sky Splitter deals 8 — the amount is settled and applied in the same resolution", async () => {
    const game = await castAtOgre();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("big");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("excited")).toBe("trash");
    expect(game.p1.hand()).toEqual(["small"]);
    expect(game.state("ogre").damage).toBe(8);
    expect(game.zoneOf("ogre")).toBe("battlefield-bf1"); // 9 Might survives
  });

  test("same declared target, different discard: the [1] Hextech Ray deals only 1", async () => {
    const game = await castAtOgre();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("ogre").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
