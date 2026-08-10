/**
 * Ruling 07f2536cecad5fcf — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · Order · [2][order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   (The responding move is an inline [Reaction] "Blink: move a friendly unit at a battlefield to a battlefield you control" /
 *    "Duck: move a friendly unit at a battlefield to its base" — the ruling names no specific mover.)
 *
 * Q: My opponent plays Hidden Blade on my unit; in response I move it to another battlefield. Does it survive?
 * A: From HAND: no — the requirement is only "a unit at a battlefield"; at its new battlefield it is still legal, so it
 *    dies there (and I draw 2). From HIDDEN: yes — a card played from facedown must target "here" (the battlefield it was
 *    hidden at); once the unit is elsewhere the spell mistargets and does nothing. Moving the unit to BASE saves it in
 *    both cases (no longer "at a battlefield").
 * Rules: 355.9 / 359.3.e.5 (target legality re-checked on resolution against the same requirement), 811.1.d.2 (from
 *        Hidden: targets must be "here"), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";

/** Inline [Reaction] [0]: move a friendly unit at a battlefield to a battlefield you control (= bf2 here). */
const BLINK = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: { battlefield: "controlled" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Blink",
  rulesText: "[Reaction]\nMove a friendly unit at a battlefield to a battlefield you control.",
  timing: "reaction",
} as const;

/** Inline [Reaction] [0]: move a friendly unit at a battlefield to its base. */
const DUCK = {
  abilities: [{ effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: "base", type: "move" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Duck",
  rulesText: "[Reaction]\nMove a friendly unit at a battlefield to its base.",
  timing: "reaction",
} as const;

/**
 * Turn 3, P1 active. P2 holds bf1 (Battlefield A) with a Guard (4) AND a Hidden Blade facedown there (hidden earlier), plus a
 * second Hidden Blade in hand with [2][order]. P1 holds bf2 (Battlefield B) with an Anchor (1); P1's Raider (3) attacks bf1
 * from base; P1 holds Blink and Duck. Known P1 deck top for the "draws 2".
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P2, "bf1", HIDDEN_BLADE, "hiddenBlade")
    .hand(P2, HIDDEN_BLADE, "handBlade")
    .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, BLINK, "blink")
    .hand(P1, DUCK, "duck")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Raider attacks bf1; P1 passes Focus so P2 (Focus) can act in the showdown. */
async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** P2 plays the blade at the Raider (from hand or from facedown), then passes; P1 answers with `mover` sending the Raider to `dest`. Resolves the chain. */
async function bladeThenMove(from: "hand" | "hidden", mover: "blink" | "duck"): Promise<Game> {
  const game = await raiderAttacks();
  if (from === "hand") {
    expect(game.p2.can("cast", "handBlade")).toBe(true);
    await game.p2.cast("handBlade", { targets: "raider" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  } else {
    expect(game.p2.can("reveal", "hiddenBlade")).toBe(true);
    await game.p2.reveal("hiddenBlade", { answers: ["raider"] });
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("raider");
      } else {
        break;
      }
    }
    expect(game.p2.resources()).toEqual({ energy: 2, power: { order: 1 } }); // [0] from hidden
  }
  const blade = from === "hand" ? "handBlade" : "hiddenBlade";
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: blade, controller: P2, targets: ["raider"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast(mover, mover === "blink" ? { answers: ["bf2"], targets: "raider" } : { targets: "raider" });
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key.includes("bf2"))?.key ?? d.options[0]!.key);
    } else {
      break;
    }
  }
  expect(game.chain().map((c) => c.cardId)).toEqual([blade, mover]);
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key.includes("bf2"))?.key ?? d.options[0]!.key);
    } else {
      await game.acting().passPriority();
    }
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 07f2536cecad5fcf — dodging Hidden Blade by moving: another battlefield only beats the FROM-HIDDEN blade; base beats both", () => {
  test("1. from HAND, moved to Battlefield B: the Raider is still 'a unit at a battlefield' — Hidden Blade resolves and kills it at bf2; its controller (P1) draws 2", async () => {
    const game = await bladeThenMove("hand", "blink");
    expect(game.zoneOf("handBlade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.p1.hand()).toHaveLength(3); // duck + 2 drawn
  });

  test("2. from HIDDEN at Battlefield A, moved to Battlefield B: the implicit 'here' requirement fails — the spell mistargets, the Raider SURVIVES at bf2 and nobody draws", async () => {
    const game = await bladeThenMove("hidden", "blink");
    expect(game.zoneOf("hiddenBlade")).toBe("trash"); // it resolved (did nothing)
    expect(game.zoneOf("raider")).toBe("battlefield-bf2");
    expect(game.p1.hand()).toEqual(["duck"]); // no draw 2
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });

  test("note — moved to BASE instead: the Raider survives the from-HAND blade too (no longer at a battlefield), no draw", async () => {
    const game = await bladeThenMove("hand", "duck");
    expect(game.zoneOf("handBlade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p1.hand()).toEqual(["blink"]);
  });

  test("note — moved to BASE against the from-HIDDEN blade: survives as well, no draw", async () => {
    const game = await bladeThenMove("hidden", "duck");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p1.hand()).toEqual(["blink"]);
  });

  test("control — no response: either blade kills the Raider at bf1 and P1 draws 2", async () => {
    const game = await raiderAttacks();
    await game.p2.cast("handBlade", { targets: "raider" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(4); // blink, duck + 2
  });
});
