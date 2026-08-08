/**
 * Spell modes and role-labelled targets are chosen as the spell is PLAYED.
 *
 *   355.3  "For Spells and Abilities with a bulleted list of modes to choose from, make the
 *          appropriate choices now."  — the mode is part of playing the card.
 *   355.5  "If a card requires you to specifically choose one or more Game Objects, that choice
 *          is made now."  — the chosen mode's own target (and both roles of a two-role spell).
 *   355.8  "In order to put a spell or ability on the chain, valid choices must be made for all
 *          targets."  — a mode with no legal target is not offered at all.
 *   359.3.e.5  a target made illegal in response is simply unaffected — never re-chosen.
 *   820.2.a  each [Repeat] execution makes its own choices (one mode per execution).
 *
 * Engine surface: `playSpell { mode?, modes?, targets? }`; harness `cast(card, { mode, targets })`,
 * `cast(card, { repeat, modes, targets })`; a bare `cast(card)` is asked mode → target at once, bound
 * to the chain item, before anyone receives priority. Mode options carry LABELS (printed bullets).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const FLURRY = "unl-044-219"; // [Reaction] Choose one — Counter a spell. · Play four 1-Might Bird tokens with [Deflect]. (4 + calm calm)
const MESMERIZE = "ven-052-166"; // [Reaction] Choose one — Return a friendly unit to hand. · Give an enemy unit -2 Might this turn. (1 + mind)
const CURTAIN_CALL = "unl-182-219"; // [Repeat] Choose one you haven't already chosen — Draw 1 · Deal 2 @bf · Deal 3 @base · -4 Might @bf
const MUTATION = "ogn-108-298"; // [Reaction] Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit.

/** An inline modal Action spell: "Choose one — Deal 3 to a unit at a battlefield. Draw 1." (1 energy) */
const SALVO = {
  abilities: [
    {
      effect: {
        options: [
          { effect: { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" }, label: "Deal 3 to a unit at a battlefield" },
          { effect: { amount: 1, type: "draw" }, label: "Draw 1" },
        ],
        type: "choice",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Salvo",
  timing: "action",
} as const;

/** An inline Reaction: "Return a unit to its owner's hand." (1 energy) */
const WHISK = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Test Whisk",
  timing: "reaction",
} as const;

/** An inline Action bolt for the opponent to put on the chain: "Deal 2 to a unit." */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

describe("rule 355.3 — mode variants are enumerated on the play", () => {
  test("one `mode` field per legal mode, labelled with the printed bullets; each mode plans its OWN targets (355.5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "foe")
      .hand(P1, MESMERIZE, "mes")
      .build();
    const fields = game.p1.option("cast", "mes")?.fields ?? [];
    const mode = fields.find((f) => f.name === "mode");
    expect(mode?.options).toEqual([0, 1]);
    expect(mode?.labels).toEqual(["Return a friendly unit to its owner's hand", "Give an enemy unit -2 [Might] this turn"]);
    // mode 0 only ever names the friendly unit, mode 1 only the enemy one
    expect((await game.p1.try((p) => p.cast("mes", { mode: 0, targets: "foe" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("mes", { mode: 1, targets: "ally" }))).ok).toBe(false);
    await game.p1.cast("mes", { mode: 1, targets: "foe" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mes", mode: 1, targets: ["foe"] })]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // nothing left to ask
    await game.settle();
    expect(game.state("foe")).toMatchObject({ might: 1, mightModifier: -2 });
    expect(game.zoneOf("ally")).toBe("base"); // the other mode did not happen
  });

  test("rule 355.8 — a mode with no legal target is not offered: Flurry's 'Counter a spell' exists only while a spell sits on the chain", async () => {
    const empty = await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, FLURRY, "fof").build();
    expect(empty.p1.option("cast", "fof")?.fields.find((f) => f.name === "mode")?.options).toEqual([1]);
    expect((await empty.p1.try((p) => p.cast("fof", { mode: 0 }))).ok).toBe(false);

    const facing = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", { might: 5 }, "victim")
      .hand(P2, BOLT, "bolt")
      .hand(P1, FLURRY, "fof")
      .build();
    await facing.p2.cast("bolt", { targets: "victim" });
    await facing.p2.passPriority();
    const modeField = facing.p1.option("cast", "fof")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toEqual([0, 1]);
    expect(modeField?.labels).toEqual(["Counter a spell", "Play four 1 [Might] Bird unit tokens with [Deflect]"]);
  });
});

describe("rule 355.5 — the mode's target rides on the chain item before the opponent gets priority", () => {
  test("named on the play: the counter's target is public on the chain; P2 responds knowing it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", { might: 5 }, "victim")
      .hand(P2, BOLT, "bolt")
      .hand(P1, FLURRY, "fof")
      .build();
    await game.p2.cast("bolt", { targets: "victim" });
    await game.p2.passPriority();
    await game.p1.cast("fof", { mode: 0, targets: "bolt" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "fof"]);
    expect(game.chain()[1]).toMatchObject({ mode: 0, targets: ["bolt"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("victim").damage).toBe(0); // countered
    expect(game.zoneOf("bolt")).toBe("trash");
  });

  test("a bare cast is ASKED mode → target right away (timing FIN, labelled), still before priority", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "a")
      .unit(P2, "bf1", { might: 4 }, "b")
      .hand(P1, SALVO, "salvo")
      .build();
    await game.p1.cast("salvo");
    const modes = game.decision() as PickDecision;
    expect(modes).toMatchObject({ kind: "pick", seat: P1, semantics: "mode", timing: "FIN" });
    expect(modes.options.map((o) => o.label)).toEqual(["Deal 3 to a unit at a battlefield", "Draw 1"]);
    await game.p1.chooseMode(0);
    const targets = game.decision() as PickDecision;
    expect(targets).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(targets.options.map((o) => o.card).sort()).toEqual(["a", "b"]);
    await game.p1.pick("b");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "salvo", mode: 0, targets: ["b"] })]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // P1 still holds priority; P2 is next
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("b").damage).toBe(3);
    expect(game.state("a").damage).toBe(0);
  });
});

describe("rule 359.3.e.5 — a response that makes the chosen target illegal fizzles that instruction; nothing is re-chosen", () => {
  test("mode target whisked back to hand in response: no damage anywhere, no new prompt", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "a")
      .unit(P2, "bf1", { might: 4 }, "b")
      .hand(P1, SALVO, "salvo")
      .hand(P2, WHISK, "whisk")
      .build();
    await game.p1.cast("salvo", { mode: 0, targets: "b" });
    await game.p1.passPriority();
    await game.p2.cast("whisk", { targets: "b" });
    await game.settle();
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.state("a").damage).toBe(0); // "a" was never chosen and is not substituted
    expect(game.zoneOf("salvo")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "action" });
  });

  test("two-role spell (ogn-108 Convergent Mutation): the reference unit bounced in response → the raised unit is unaffected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "small")
      .unit(P1, "base", { might: 6 }, "big")
      .unit(P1, "base", { might: 9 }, "huge")
      .hand(P1, MUTATION, "cm")
      .hand(P2, WHISK, "whisk")
      .build();
    await game.p1.cast("cm", { targets: ["small", "big"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cm", targets: ["small", "big"] })]);
    await game.p1.passPriority();
    await game.p2.cast("whisk", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.state("small").might).toBe(2); // not raised to "huge" instead
  });
});

describe("rule 355.5 — two-role targets (target1 / target2) are both chosen on the play and mandatory", () => {
  test("Convergent Mutation: ordered [raised, reference] pairs of friendly units only; a bare play is not legal; raised → reference's Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", { might: 2 }, "small")
      .unit(P1, "base", { might: 6 }, "big")
      .unit(P2, "base", { might: 9 }, "foe")
      .hand(P1, MUTATION, "cm")
      .build();
    const targets = game.p1.option("cast", "cm")?.fields.find((f) => f.name === "targets");
    expect(targets?.required).toBe(true);
    expect(targets?.roles).toEqual(["target1: unit whose Might increases", "target2: reference unit"]);
    expect(targets?.options).toEqual(expect.arrayContaining([["small", "big"], ["big", "small"]]));
    expect(targets?.options).toHaveLength(2);
    expect((await game.p1.try((p) => p.do("playSpell", { cardId: "cm", playerId: P1 }))).ok).toBe(false);
    await game.p1.cast("cm", { targets: ["small", "big"] });
    await game.settle();
    expect(game.state("small").might).toBe(6);
    expect(game.state("big").might).toBe(6);
  });
});

describe("rule 820.2.a — [Repeat]: one mode per execution, supplied whole as `modes`", () => {
  test("Curtain Call ×2 with modes [Deal 2 @bf, Draw 1] and the damage target named: nothing is asked, both executions happen", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "bf1", { might: 6 }, "foeA")
      .unit(P2, "bf1", { might: 6 }, "foeB")
      .hand(P1, CURTAIN_CALL, "cc")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("cc", { modes: [1, 0], repeat: 1, targets: ["foeB"] });
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // no mode / target prompt
    await game.settle();
    expect(game.state("foeB").damage).toBe(2);
    expect(game.state("foeA").damage ?? 0).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // cast one, drew one
  });

  test("the same mode twice is rejected for a 'not chosen this turn' menu; a wrong-length `modes` list is rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "bf1", { might: 6 }, "foeA")
      .hand(P1, CURTAIN_CALL, "cc")
      .build();
    expect((await game.p1.try((p) => p.cast("cc", { modes: [0, 0], repeat: 1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("cc", { modes: [0], repeat: 1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("cc", { modes: [1, 0], repeat: 1 }))).ok).toBe(false); // the damage mode needs its target
    await game.p1.cast("cc", { modes: [0, 1], repeat: 1, targets: ["foeA"] });
    await game.settle();
    expect(game.state("foeA").damage).toBe(2);
  });
});
