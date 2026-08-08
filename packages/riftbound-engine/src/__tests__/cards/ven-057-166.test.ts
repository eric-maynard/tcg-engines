/**
 * Covert Informant — ven-057-166 · Unit · Mind · 3 energy + [mind] · 4 Might
 *
 *   [Empower] [3] ([3]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] When I move, draw 1.
 *
 * Head-judge notes (the tricky spots this file pins down):
 *   1. The draw trigger is a DEPENDENT ability (828.1.b.1): it exists only while the Informant has the
 *      Empowered status. Un-empowered moves draw nothing, and empowering AFTER a move is not retroactive.
 *   2. "When I move" is ANY Move (446.1): a standard move in either direction, or being relocated by
 *      a spell (Flash) — even on the opponent's turn. Moving two units together is still one move of
 *      ME → exactly one card.
 *   3. A Recall is NOT a Move (455/456): an empowered attacker bounced home by combat cleanup because
 *      the (stunned) defender survived draws nothing for the trip back.
 *   4. Into an enemy battlefield the trigger lands on the chain inside the showdown and resolves
 *      before combat — the card is drawn even if the Informant then dies.
 *   5. [Empower] [3] is energy-only, an activated ability of a unit (827.1, 145.2): uses the chain,
 *      only on your turn in a Neutral Open state, only while not already Empowered.
 *   6. Partner — Sanction (ven-035-166) "Empower a unit. Disempower it at end of turn": the draw works
 *      for that turn only; next turn the same move draws nothing.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-057-166";
const FLASH = "ogs-011-024"; // [Reaction] 2: move up to 2 friendly units to base
const DISCIPLINE = "ogn-058-298"; // [Reaction] 2: +2 Might this turn, draw 1 (something for P2 to open a chain with)
const SANCTION = "ven-035-166"; // [Reaction] 3+[calm]: choose one — Empower a unit, disempower it at end of turn / …
const FILLER = "ogn-175-298";

function board(opts: { empowered?: boolean; energy?: number } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", CARD, "spy", opts.empowered ? { empowered: true } : undefined)
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
}

describe("Covert Informant (ven-057-166)", () => {
  test("registry payload: activated Empower for [3] (energy only) gated on not-empowered; move→draw 1 trigger conditioned on while-empowered", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 4, powerCost: ["mind"] });
    expect(def?.abilities).toEqual([
      { cost: { energy: 3 }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" },
      { condition: { type: "while-empowered" }, effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" },
    ]);
  });

  test("costs 3 energy + [mind] for a 4-Might unit that enters exhausted and un-empowered; missing the mind pip or 1 energy short → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "spy").build();
    await game.p1.play("spy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("spy")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 4, zone: "base" });
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "spy").build()).p1.can("play", "spy")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "spy").build()).p1.can("play", "spy")).toBe(false);
  });

  test("[Empower] [3]: pays exactly 3 energy and no power, sits on the chain, resolves → Empowered; then no longer offered", async () => {
    const game = await board({ energy: 6 }).resources(P1, { energy: 6, power: { mind: 2 } }).build();
    await game.p1.activate("spy");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", triggered: false })]);
    expect(game.state("spy").isEmpowered).toBe(false);
    await game.settle();
    expect(game.state("spy").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "spy")).toBe(false); // "Use only if not Empowered" — 3 energy still floating
  });

  test("Empower gates: 2 energy → not offered; opponent's turn → not offered; during my showdown → not offered; enemy Informant → not mine", async () => {
    expect((await board({ energy: 2 }).build()).p1.can("activate", "spy")).toBe(false);
    expect((await board({ energy: 3 }).active(P2).build()).p1.can("activate", "spy")).toBe(false);
    const sd = await board({ energy: 3 }).build();
    await sd.p1.move("spy", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("activate", "spy")).toBe(false);
    const theirs = await scenario().resources(P1, { energy: 3 }).unit(P2, "base", CARD, "spy").build();
    expect(theirs.p1.can("activate", "spy")).toBe(false);
  });

  test("negative: NOT empowered, a move puts nothing on the chain and draws nothing", async () => {
    const game = await board().build();
    await game.p1.move("spy", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.locationOf("spy")).toBe("bf1");
  });

  test("empower → move to my own battlefield: trigger on the chain, resolves, draw exactly 1 (top card)", async () => {
    const game = await board().build();
    await game.p1.activate("spy");
    await game.settle();
    await game.p1.move("spy", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("order matters (828.1.c): move first, THEN empower the same turn → no retroactive draw", async () => {
    const game = await board().build();
    await game.p1.move("spy", "bf1");
    await game.settle();
    await game.p1.activate("spy");
    await game.settle();
    expect(game.state("spy").isEmpowered).toBe(true);
    expect(game.p1.hand()).toEqual([]);
  });

  test("any direction, any turn: still empowered next turn, the walk back bf1 → base draws again", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.move("spy", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.advanceTurn();
    await game.advanceTurn(); // P1's turn again: +1 draw-phase card (d2)
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "bf1" });
    const before = game.p1.hand().length;
    await game.p1.move("spy", "base");
    await game.settle();
    expect(game.locationOf("spy")).toBe("base");
    expect(game.p1.hand()).toHaveLength(before + 1);
  });

  test("moving together with another unit is one move of ME: exactly one card drawn", async () => {
    const game = await board({ empowered: true }).unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p1.move(["spy", "buddy"], "bf1");
    expect(game.chain().filter((i) => i.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("into an enemy battlefield: the draw resolves inside the showdown before combat — kept even though the 4-Might Informant dies to the 6-Might Wall", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.move("spy", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", triggered: true })]);
    await game.p1.pass();
    await game.p2.pass(); // trigger resolves; showdown still open
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // combat: 4 into 6
    expect(game.zoneOf("spy")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf2");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("a Recall is not a Move (456): attacking a STUNNED 6-Might Wall, both survive, the Informant is recalled home — one draw for going, none for coming back", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", CARD, "spy", { empowered: true })
      .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p1.move("spy", "bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf2"); // 4 < 6
    expect(game.locationOf("spy")).toBe("base"); // stunned Wall dealt nothing → survivor recalled (466.1.a.2)
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.hand()).toEqual(["d1"]); // exactly one: the move in
    expect(game.chain()).toEqual([]);
  });

  test("moved by a spell on the OPPONENT's turn (Flash to base) is still 'I move' (446.1) → draw 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "spy", { empowered: true })
      .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs")
      .hand(P1, FLASH, "flash")
      .hand(P2, DISCIPLINE, "disc")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .build();
    await game.p2.cast("disc", { targets: "theirs" });
    await game.p2.pass();
    await game.p1.cast("flash", { targets: "spy" });
    await game.p1.pass();
    await game.p2.pass(); // Flash resolves (LIFO) → Informant relocates → trigger
    expect(game.locationOf("spy")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc" }), expect.objectContaining({ cardId: "spy", triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("partner — Sanction's turn-long Empower: the move draws this turn; after the end-of-turn disempower the next move draws nothing", async () => {
    const game = await board({ energy: 3 }).resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, SANCTION, "sanc").build();
    // rule 355.3 / 355.5 — Empower mode + the Informant named as Sanction is played; then it resolves.
    await game.p1.cast("sanc", { mode: 0, targets: "spy" });
    await game.settle();
    expect(game.state("spy").isEmpowered).toBe(true);
    await game.p1.move("spy", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.advanceTurn();
    expect(game.state("spy").isEmpowered).toBe(false); // "Disempower it at end of turn"
    await game.advanceTurn(); // back to P1 (draw phase: d2)
    const before = game.p1.hand().length;
    await game.p1.move("spy", "base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(before);
  });
});
