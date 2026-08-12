/**
 * Interaction: Trinity Force (sfd-115-221) — "[Equip] [body] … When I hold,
 *   score 1 point." × Ahri, Alluring (ogn-066-298) — "When I hold, you score 1
 *   point." × Pyke, Returned (unl-145-219) — "[Hidden] [Backline] …"
 *
 * 1v1, Victory Score 8, P1 on 6 controlling bfA. P1's Beginning Phase Scoring
 * Step: the Hold itself Scores (6→7) and the hold-triggers go on the chain
 * under ONE controller. The FIRST of them takes P1 to 8 — and the game ends
 * with a sibling item still sitting on the chain, while P2 has a facedown Pyke
 * at their OWN battlefield.
 *
 * Q: (a) does the second trigger ever resolve?  (b) does P2 get a window to
 * flip Pyke between the trigger going on the chain and it resolving — and can
 * they still flip it once the game has ended?  (c) does 470 ("Score once per
 * Battlefield per turn") deny the trigger's point?  (d) is the never-moved
 * facedown Pyke revealed at game end, and what do the terminal snapshots show?
 *
 * Rules: 421.4 (a facedown card is revealed to all players when it changes
 * zones OR when the game ends), 128.4 (Private: only its controller may look
 * before that), 383.4.d / 383.4.d.2.a (hold triggers), 383.3.d.1, 337.4
 * (Priority to the item's controller first), 340.1, 319.3 / 319.4 / 319.5
 * (Cleanups on add / finalize / leave), 320 (no finalizing or resolving while a
 * Cleanup runs), 323.1 / 472 / 196 (the win check and the end of the game),
 * 194.1.c / 468.1 / 470 (Scoring vs gaining points), 471.2.c, 811.1.b (a
 * [Hidden] card gains [Reaction] and is playable for [0] from the next turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-066-298";
const TRINITY_FORCE = "sfd-115-221";
const PYKE = "unl-145-219";

/**
 * The literal board of the question: one hold trigger printed on a unit, the
 * other on an Equipment attached to a second unit at the same battlefield.
 */
function equippedBoard() {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, 6)
    .victoryScore(8)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", AHRI, "ahri")
    .unit(P1, "bfA", { might: 3 }, "carrier")
    .card("trinity", { def: TRINITY_FORCE, meta: { attachedTo: "carrier" }, owner: P1, zone: "bfA" })
    .unit(P2, "bfB", { might: 2 }, "p2guard")
    .facedown(P2, "bfB", PYKE, "pyke");
}

/**
 * Same position, but with the SECOND hold trigger printed on a second copy of
 * Ahri (rule 103.2.b allows three) — because the engine does not raise Trinity
 * Force's, and the shape under test is "two simultaneous hold triggers, one
 * controller, the game ends between them".
 */
function twoTriggerBoard() {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P1, 6)
    .victoryScore(8)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", AHRI, "ahri")
    .unit(P1, "bfA", AHRI, "ahri2")
    .unit(P2, "bfB", { might: 2 }, "p2guard")
    .facedown(P2, "bfB", PYKE, "pyke");
}

describe("Trinity Force / Ahri hold triggers × a game that ends mid-chain", () => {
  test("Trinity Force's 'When I hold, score 1 point' triggers — an equipped hold source puts its own item on the chain beside Ahri's (383.4.d)", async () => {
    // rule 150.2 — Trinity Force's Effect Text is part of the wearer's text, so
    // holding bfA raises TWO triggers (Ahri's and Trinity Force's), both
    // controlled by P1.
    const game = await equippedBoard().build();
    expect(game.state("trinity").attachedTo).toBe("carrier");
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(2);
  });

  test("(a) the Hold Scores 1 and the hold triggers become chain items; the FIRST to resolve takes P1 to the Victory Score", async () => {
    const game = await twoTriggerBoard().build();
    expect(game.p1.points()).toBe(6);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7); // 383.4.d — the Hold itself Scored bfA
    expect(game.chain().map((i) => i.controller)).toEqual([P1, P1]);
    expect(game.chain().every((i) => i.triggered)).toBe(true);
  });

  test("(a) the SECOND trigger is abandoned: the game ends at 8, the item is still on the chain, and it is neither resolved nor countered (320 / 323.1 / 472 / 196)", async () => {
    const game = await twoTriggerBoard().build();
    await game.p2.endTurn();
    await game.settle();

    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8); // NOT 9 — the sibling never resolved
    const leftover = game.chain();
    expect(leftover).toHaveLength(1);
    expect(leftover[0]).toMatchObject({ controller: P1, countered: false, triggered: true });
    expect(game.violations()).toEqual([]);
  });

  test("(b) P2 DOES get a window before the trigger resolves: after P1 holds priority first (337.4), P2 may flip the facedown Pyke for [0] (811.1.b)", async () => {
    const game = await twoTriggerBoard().build();
    await game.p2.endTurn();
    expect(game.actingSeat()).toBe(P1); // controller of the chain item first
    expect(game.p1.points()).toBe(7);

    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "pyke")).toBe(true);
    expect(game.isOver()).toBe(false);
  });

  test("(b) once the game has ended there is no priority and no Decision — every later move from either seat is rejected with the state unchanged", async () => {
    const game = await twoTriggerBoard().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.decision()).toBeNull();
    expect(game.actingSeat()).toBeUndefined();

    const hash = game.stateHash();
    const flip = await game.p2.try((p) => p.reveal("pyke"));
    const end = await game.p1.try((p) => p.endTurn());
    expect(flip.ok).toBe(false);
    expect(end.ok).toBe(false);
    expect(game.stateHash()).toBe(hash);
  });

  test("(c) 470 does not deny the trigger's point — the Hold already Scored bfA this turn, yet the ability's Score still lands", async () => {
    // RULING-CONFLICT: read strictly, 470 ("a player may only Score, from
    // either method, once per Battlefield per turn") plus 468.1 ("every
    // instance of Scoring is also an instance of Gaining points") would gate
    // Ahri's "you score 1 point" behind the Hold that already Scored bfA this
    // turn. The engine treats a card ability's Score (194.1.c) as unbound by
    // 470 — "either method" being Hold and Conquer — so the trigger pays out.
    // This test pins the engine's reading; without it the position could never
    // reach the Victory Score and the whole chain-loaded question is vacuous.
    const game = await twoTriggerBoard().build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(7);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(8);
  });

  test("(d) 421.4 — the never-moved facedown Pyke at P2's OWN battlefield is revealed to P1 when the game ends, and it does not change zones", async () => {
    const game = await twoTriggerBoard().build();

    // 128.4 before the end: P1 sees an anonymous facedown object owned by P2.
    const before = game.view(P1).zones["facedown-bfB"] ?? [];
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ hidden: true, owner: P2 });
    expect(before[0]).not.toHaveProperty("defId");

    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);

    const after = game.view(P1).zones["facedown-bfB"] ?? [];
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ defId: PYKE, name: "Pyke, Returned", owner: P2 });
    // Not banished (652 — the game did not continue) and not trashed (323.7 —
    // no Cleanup runs after the end): it sits in the slot it always occupied.
    expect(game.zoneOf("pyke")).toBe("facedown-bfB");
    // Both seats' terminal snapshots name it.
    expect(game.view(P2).zones["facedown-bfB"]?.[0]).toMatchObject({ defId: PYKE });
  });
});
