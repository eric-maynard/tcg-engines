/**
 * Jae Medarda — sfd-142-221 · Unit · Chaos · 5 energy + [chaos][chaos] · 5 might
 *
 *   When you choose me with a spell, draw 1.
 *
 * Rules: 383.4.b Targeting Effects ("When you choose me…" triggers when Jae becomes the TARGET of a
 * spell — 355.7 — and is put on the chain as a pending item right after that spell is FINALIZED,
 * 383.4.b.2, i.e. it sits above the spell and resolves first); 355.10.d (programmatic selection such
 * as "ready your units" is not a choice); "you" = Jae's controller; "with a spell" excludes unit /
 * gear / legend abilities (Equip is an activated ability of a gear, 476.1).
 *
 * Head-judge corner cases for THIS card:
 *   1. Timing: the draw is on the chain ABOVE the spell and resolves before it — so a spell that is
 *      later countered (Wind Wall) still drew the card.
 *   2. Enemy spell choosing Jae (Rebuke) → nobody draws; "you" is the controller, not the caster.
 *   3. Non-spell choice: [Equip]-ing Doran's Ring onto Jae chooses him with a gear ability → no draw.
 *   4. No choice at all: On the Hunt ("Ready your units") affects Jae without targeting → no draw.
 *   5. Multi-target spell (Defiant Dance +2/-2): Jae in either role draws exactly 1; two Jaes chosen
 *      by the same Dance draw 1 each; a Reaction cast on the OPPONENT's turn still draws.
 *   6. Chaos partner Ride the Wind: choose Jae → draw, then Jae moves and readies; Arcane Shift:
 *      choose Jae → draw resolves first, then Jae is banished and replayed (fresh object, exhausted).
 *   7. Zone: Jae in hand is never "chosen"; cost 5 + [chaos][chaos] exactly.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-142-221";
const CLEAVE = "ogn-004-298"; // Action, 1: give a unit Assault 3 this turn
const RIDE_THE_WIND = "ogn-173-298"; // Action, 2+[chaos]: move a friendly unit and ready it
const DEFIANT_DANCE = "sfd-196-221"; // Reaction, 1+[rainbow]: a unit +2, another unit -2 this turn
const DISCIPLINE = "ogn-058-298"; // Reaction, 2+[calm]: give a unit +2 this turn, draw 1
const REBUKE = "ogn-172-298"; // Action, 2+[chaos][chaos]: return a unit at a battlefield to hand
const WIND_WALL = "ogn-064-298"; // Reaction, 3+[calm][calm]: counter a spell
const ON_THE_HUNT = "sfd-204-221"; // 1+[rainbow][rainbow]: ready your units
const RING = "sfd-124-221"; // Doran's Ring — Equipment, [Equip] [chaos], +1
const ARCANE_SHIFT = "sfd-200-221"; // Action 3+[rainbow]: banish friendly unit, owner replays it; 3 to enemy at bf; banish this

function jaeInBase(res: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario().resources(P1, res).unit(P1, "base", CARD, "jae");
}

describe("Jae Medarda (sfd-142-221)", () => {
  test("registry payload: 5-cost [chaos][chaos] 5-might unit with ONE triggered draw-1 on being chosen by its controller's spell", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, might: 5, name: "Jae Medarda" });
    expect(def?.powerCost).toEqual(["chaos", "chaos"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, type: "draw" },
      trigger: { event: "choose", on: { actor: "controller", filter: expect.arrayContaining(["self", "spell"]) } },
      type: "triggered",
    });
  });

  test("cost: 5 energy + 2 chaos exactly; enters exhausted; 4 energy or a single chaos is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "jae").build();
    await game.p1.play("jae");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("jae")).toBe("base");
    expect(game.state("jae")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.hand()).toEqual([]); // playing him chooses nothing
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 2 } }).hand(P1, CARD, "jae").build()).p1.can("play", "jae")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "jae").build()).p1.can("play", "jae")).toBe(false);
  });

  test("383.4.b.2 timing: casting Cleave on Jae puts his draw on the chain ABOVE the spell; it resolves first, then Cleave", async () => {
    const game = await jaeInBase({ energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    const deck = game.p1.deck().length;
    await game.p1.cast("cleave", { targets: "jae" });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["cleave", false],
      ["jae", true],
    ]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn at finalization
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Jae) resolves
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]); // spell still waiting
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("jae").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.violations()).toEqual([]);
  });

  test("the draw survives a counterspell: Wind Wall counters Cleave, but Jae was already chosen → P1 still nets 1 card", async () => {
    const game = await jaeInBase({ energy: 1 })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, WIND_WALL, "wall")
      .build();
    await game.p1.cast("cleave", { targets: "jae" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Jae's draw resolves
    expect(game.p1.hand()).toHaveLength(1);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("wall", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("jae").grantedKeywords).toEqual([]); // countered: no Assault
    expect(game.p1.hand()).toHaveLength(1); // but the card stays drawn
  });

  test("'you choose': the OPPONENT's Rebuke choosing Jae draws nobody a card (Jae just goes back to hand)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "jae")
      .hand(P2, REBUKE, "rebuke")
      .build();
    await game.p2.cast("rebuke", { targets: "jae" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rebuke"]); // no Jae trigger
    await game.settle();
    expect(game.zoneOf("jae")).toBe("hand");
    expect(game.p1.hand()).toEqual(["jae"]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("'with a spell': [Equip]-ing Doran's Ring onto Jae is a gear ABILITY choosing him → attaches (+1) but no draw", async () => {
    const game = await jaeInBase({ power: { chaos: 1 } }).gear(P1, RING, "ring").build();
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "jae" });
    await game.settle();
    expect(game.state("ring").attachedTo).toBe("jae");
    expect(game.state("jae").might).toBe(6);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("355.10.d — not chosen: On the Hunt readies Jae without targeting him → no draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .unit(P1, "base", CARD, "jae", { exhausted: true })
      .hand(P1, ON_THE_HUNT, "hunt")
      .build();
    await game.p1.cast("hunt");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hunt"]);
    await game.settle();
    expect(game.state("jae").isReady).toBe(true);
    expect(game.p1.hand()).toEqual([]);
  });

  test("multi-target Defiant Dance choosing Jae once (as the -2 role) must create exactly ONE trigger / draw exactly 1 (383.4.b.2)", async () => {
    // Expected: one Jae item on the chain, one card drawn, Jae 5→3 this turn and 5 again next turn.
    // Actual: the two-slot spell fires the `choose` event twice for the same target → 2 triggers, 2 cards.
    const game = await jaeInBase({ energy: 1, power: { rainbow: 1 } })
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, DEFIANT_DANCE, "dance")
      .build();
    await game.p1.cast("dance", { targets: ["foe", "jae"] });
    expect(game.chain().filter((c) => c.cardId === "jae")).toHaveLength(1);
    await game.settle();
    expect(game.state("foe").might).toBe(4);
    expect(game.state("jae").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(1);
    await game.advanceTurn();
    expect(game.state("jae").might).toBe(5);
  });

  test("two Jaes chosen by one Defiant Dance (+2 on one, -2 on the other) → exactly two triggers → draw 2", async () => {
    // Expected: jae and jae2 each trigger once (2 cards). Actual: each triggers twice (4 items, 4 cards).
    const game = await jaeInBase({ energy: 1, power: { rainbow: 1 } }).unit(P1, "base", CARD, "jae2").hand(P1, DEFIANT_DANCE, "dance").build();
    await game.p1.cast("dance", { targets: ["jae", "jae2"] });
    expect(game.chain().filter((c) => c.triggered).map((c) => c.cardId).sort()).toEqual(["jae", "jae2"]);
    await game.settle();
    expect(game.state("jae").might).toBe(7);
    expect(game.state("jae2").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("on the OPPONENT's turn: P1 reacts with Discipline (+2, draw 1) choosing Jae → Jae's trigger + the spell = 2 cards for P1, none for P2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "jae")
      .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, CLEAVE, "cleave")
      .build();
    // P2 opens a chain with Cleave on their own unit; P1 gets priority and reacts.
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("disc", { targets: "jae" });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["cleave", P2],
      ["disc", P1],
      ["jae", P1],
    ]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.hand()).toEqual([]);
    expect(game.state("jae").might).toBe(7);
  });

  test("Chaos partner Ride the Wind: choosing Jae draws 1 first, then Jae moves to bf1 and is readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "jae", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "jae" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw", "jae"]);
    await game.settle(); // draw, then move (bf1 is the only destination) + ready; an open bf → showdown handed back
    await game.settle(); // both pass focus
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("jae")).toBe("battlefield-bf1");
    expect(game.state("jae").isReady).toBe(true);
    expect(game.zoneOf("rtw")).toBe("trash");
  });

  test("Arcane Shift choosing Jae → exactly one draw, then Jae is banished and replayed to base exhausted, 3 to the enemy, spell banished", async () => {
    // Expected: chain [shift, jae] and one card in hand at the end (the replay is not a "choose").
    // Actual: same duplicate-`choose` bug as Defiant Dance — two Jae triggers, two cards.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Victim" }, "victim")
      .unit(P1, "base", CARD, "jae")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["jae", "victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift", "jae"]);
    game.script(P1, ["base"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("jae")).toBe("base");
    expect(game.state("jae").isExhausted).toBe(true);
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(1); // exactly one draw — the replay is not a "choose"
  });

  test("zone: a Jae in HAND is not a unit on the board — Cleave cannot choose him and nothing is drawn", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "jae").unit(P1, "base", { might: 1 }, "pawn").hand(P1, CLEAVE, "cleave").build();
    const r = await game.p1.try((p) => p.cast("cleave", { targets: "jae" }));
    expect(r.ok).toBe(false);
    await game.p1.cast("cleave", { targets: "pawn" });
    await game.settle();
    expect(game.p1.hand()).toEqual(["jae"]);
  });
});
