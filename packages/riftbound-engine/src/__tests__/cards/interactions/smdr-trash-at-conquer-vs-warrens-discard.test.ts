/**
 * Interaction: Super Mega Death Rocket! (ogn-252-298) · Spell · 4 + [rainbow]
 *     "Deal 5 to a unit.
 *      When you conquer, you may discard 1 to return this from your trash to your hand."
 *   × Zaun Warrens (ogn-298-298) · Battlefield
 *     "When you conquer here, discard 1, then draw 1."
 *
 * Board: P1's turn. P2 controls Zaun Warrens (bf1) with a lone 4-Might defender; P1 has a 3-Might
 * Runner in base and SMDR in hand; P1's next draw is `top`.
 *
 * Questions / expected:
 *  (a) P1 casts SMDR (no Action keyword — main phase, open state) killing the defender. The spell goes to
 *      P1's trash as the last step of its resolution (359.3.d / 351.2); bf1 loses its controller in the next
 *      open-state Cleanup (190.4.c). Runner walks in → non-combat showdown → both pass → P1 conquers (+1).
 *      SMDR is in the trash (public zone, 355.10.a.1) at that moment, so its trash-only trigger (385.2) is
 *      pending together with Warrens' trigger (controlled by the conqueror, 190.6). SMDR's "you may discard 1
 *      to …" is a may + cost at the start of the effect ⇒ decided and PAID at finalization (383.3.a/b/b.1),
 *      before anything resolves (337). P1 orders the two (383.3.d). With SMDR at the bottom: Warrens resolves
 *      "discard 1" on an empty hand → ignored (422.4), "then draw 1"; SMDR then returns trash → hand.
 *  (b) 0 cards in hand at the conquer: the finalization cost cannot be paid → SMDR's trigger never makes it
 *      onto the chain (383.3.a.2 / 383.3.b.1); Warrens still draws, but that card arrives after the conquer
 *      event — no retroactive trigger.
 *  (c) SMDR still in HAND at the conquer: inert there (385.2, hand is private 108.7.c). Discarding it to
 *      Warrens puts it in the trash only after the conquer was processed (383.2.c) → it does not return.
 *  (d) P1 at 7/8 points with SMDR in trash and an empty hand: conquering draws instead of scoring
 *      (471.1.b.1) as part of the conquer itself, so the drawn card is in hand when SMDR's discard cost is
 *      paid at finalization → SMDR can come back.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMDR = "ogn-252-298";
const ZAUN_WARRENS = "ogn-298-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit, used as hand/deck filler

type OrderD = Extract<Decision, { kind: "order" }>;

/** P2's live Zaun Warrens with a lone 4-Might defender; P1: Runner (3) in base, SMDR in hand, `hand` fillers, `top` on deck. */
function board(hand: number) {
  let s = scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false, owner: P2 })
    .unit(P2, "bf1", { might: 4, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, SMDR, "rocket")
    .deckTop(P1, FILLER, "top");
  for (let i = 0; i < hand; i++) {
    s = s.hand(P1, FILLER, `junk${i}`);
  }
  return s;
}

/** Cast SMDR at the defender and let it resolve; then walk Runner onto the emptied Warrens and pass the showdown. */
async function killThenConquer(game: Game): Promise<void> {
  await game.p1.cast("rocket", { targets: "def" });
  await game.settle();
  await game.p1.move("runner", "bf1");
  // Non-combat showdown: both pass focus → P1 conquers. Stop at the first non-action prompt / order offer.
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.seat(d.seat).pass();
  }
}

/** Put SMDR's trigger at the BOTTOM (Warrens on top → Warrens resolves first). */
function rocketBottom(d: OrderD): string[] {
  const rocket = d.items.find((i) => i.card === "rocket")?.key as string;
  const warrens = d.items.find((i) => i.card !== "rocket")?.key as string;
  return [rocket, warrens];
}

describe("(a) SMDR cast from hand is in the trash in time for its own conquer trigger; two simultaneous conquer triggers", () => {
  test("SMDR resolves: defender dies, the spell lands in P1's trash, and bf1 becomes uncontrolled in the following Cleanup (359.3.d, 190.4.c)", async () => {
    const game = await board(1).build();
    await game.p1.cast("rocket", { targets: "def" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rocket"]);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("move")).toBe(true);
  });

  test("Runner conquers the empty Warrens (+1); BOTH triggers are pending, both controlled by P1, and SMDR's opt-in cost is asked at FINALIZATION before anyone gets priority (383.3.a/b, 337)", async () => {
    const game = await board(1).build();
    await killThenConquer(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["bf1", "rocket"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
  });

  test("paying: P1 says yes and discards its only card NOW (cost at finalization, 383.3.b.1) — junk is in the trash while both items are still on the chain; then P1 is offered the ORDER over exactly {Warrens, SMDR} (383.3.d)", async () => {
    const game = await board(1).build();
    await killThenConquer(game);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("junk0");
    expect(game.zoneOf("junk0")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toHaveLength(2);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as OrderD).items.map((i) => i.card).toSorted()).toEqual(["bf1", "rocket"]);
  });

  test("SMDR at the bottom: Warrens resolves first — 'discard 1' with an empty hand is ignored, 'then draw 1' (422.4); then SMDR returns trash → hand. End: hand {top, rocket}, trash {junk}", async () => {
    const game = await board(1).build();
    await killThenConquer(game);
    await game.p1.yes();
    await game.p1.pick("junk0");
    const d = game.decision() as OrderD;
    await game.p1.order(rocketBottom(d));
    expect(game.chain().map((c) => c.cardId)).toEqual(["rocket", "bf1"]); // bottom → top
    // Resolve Warrens (top) only.
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rocket"]);
    expect(game.p1.hand()).toEqual(["top"]); // nothing was discarded, drew 1
    expect(game.zoneOf("rocket")).toBe("trash"); // not yet
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand().toSorted()).toEqual(["rocket", "top"]);
    expect(game.p1.trash()).toEqual(["junk0"]);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — SMDR on TOP: it returns to hand first, and Warrens' mandatory 'discard 1' then bins it again (422.4: discard as many as possible); P1 still draws", async () => {
    const game = await board(1).build();
    await killThenConquer(game);
    await game.p1.yes();
    await game.p1.pick("junk0");
    const d = game.decision() as OrderD;
    await game.p1.order(rocketBottom(d).toReversed());
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf1", "rocket"]);
    await game.settle(); // rocket → hand; Warrens: forced single discard = rocket; draw top
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.trash().toSorted()).toEqual(["junk0", "rocket"]);
  });
});

describe("(b) 0 cards in hand at the conquer: SMDR's cost is unpayable — its trigger never finalizes; Warrens' later draw does not retro-trigger it", () => {
  test("no payable opt-in is ever offered, SMDR never sits on the chain, Warrens draws 1, SMDR stays in the trash", async () => {
    const game = await board(0).build();
    await killThenConquer(game);
    expect(game.p1.points()).toBe(1);
    const offeredPayable: string[] = [];
    let rocketOnChain = false;
    for (let i = 0; i < 12; i++) {
      rocketOnChain ||= game.chain().some((c) => c.cardId === "rocket" && !c.countered);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        if (d.canAccept !== false) {
          offeredPayable.push(d.prompt);
        }
        await game.seat(d.seat).no();
      } else if (d.kind === "order") {
        await game.seat(d.seat).order([]);
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        await game.seat(d.seat).pass();
      }
    }
    // A canAccept:false prompt would be tolerable UI; a payable one is not (nothing to discard).
    expect(offeredPayable).toEqual([]);
    expect(rocketOnChain).toBe(false);
    expect(game.p1.hand()).toEqual(["top"]); // Warrens: discard ignored, drew 1
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(c) SMDR still in HAND at the conquer: inert there; discarding it to Warrens afterwards does not bring it back", () => {
  test("only Warrens triggers; its 'discard 1' forces the lone SMDR out of hand, P1 draws 1, and SMDR stays in the trash with no further prompt (385.2, 383.2.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .hand(P1, SMDR, "rocket")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p1.move("runner", "bf1");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "showdown") {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.p1.points()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf1"]); // no SMDR item from hand
    const r = await game.settle(); // Warrens resolves; the single-card discard is forced
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("rocket");
      await game.settle();
    }
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no yes-no for SMDR
  });
});

describe("(d) at 7/8 points with an empty hand: the conquer DRAWS instead of scoring (471.1.b.1) — that card pays SMDR's finalization cost", () => {
  function lastPointBoard() {
    return scenario()
      .points(P1, 7)
      .victoryScore(8)
      .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 }) // not scored this turn → no Final Point
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .trash(P1, SMDR, "rocket")
      .deckTop(P1, FILLER, "top");
  }

  async function conquer(game: Game): Promise<void> {
    await game.p1.move("runner", "bf1");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "showdown") {
        break;
      }
      await game.seat(d.seat).pass();
    }
  }

  test("the conquer yields a draw, not a point: P1 stays at 7, `top` is in hand, and SMDR's opt-in is offered as PAYABLE with both triggers on the chain", async () => {
    const game = await lastPointBoard().build();
    expect(game.p1.hand()).toEqual([]);
    await conquer(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["bf1", "rocket"]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
  });

  test("P1 pays by discarding the just-drawn card; with SMDR ordered to the bottom, Warrens (empty hand) just draws, then SMDR returns to hand", async () => {
    const game = await lastPointBoard().build();
    await conquer(game);
    await game.p1.yes();
    await game.p1.pick("top");
    expect(game.zoneOf("top")).toBe("trash");
    const d = game.decision() as OrderD;
    expect(d.kind).toBe("order");
    await game.p1.order(rocketBottom(d));
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(2); // rocket + Warrens' draw
    expect(game.p1.trash()).toEqual(["top"]);
    expect(game.p1.points()).toBe(7);
    expect(game.violations()).toEqual([]);
  });
});
