/**
 * Ruling caca8247e718acf6 — Kinkou Initiate (UNL-097 → unl-097-219) · Unit · Body · [3] · 3 Might
 *     "When you play me, draw 1 if your other units have total Might 5 or more."
 *   × Pridestalker (UNL-183 → unl-183-219) · Legend (Rengar) "When you play a unit, give a unit +1 [Might] this turn."
 *
 * Q: Rengar legend, a 4-Might unit in base; I play Kinkou Initiate to base and Pridestalker pushes the 4 to 5 — do I draw?
 * A: Yes, if you order it right. Both triggers fire off the same play; as controller of both you choose their order on
 *    the chain (Kinkou's first = bottom, Pridestalker's on top). LIFO: Pridestalker resolves first (+1 → 5), then Kinkou's
 *    ability checks total Might ON RESOLUTION, sees 5 and draws 1.
 * Rules: 333.1 / 383.3.d (controller orders simultaneous triggers), 340.1 (LIFO), conditions checked on resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINKOU_INITIATE = "unl-097-219";
const PRIDESTALKER = "unl-183-219";

/** P1's turn: Pridestalker legend, a 4-Might Huntress in base, Kinkou Initiate in hand with exactly [3]. */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "rengar")
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 4, name: "Huntress" }, "huntress")
    .hand(P1, KINKOU_INITIATE, "kinkou");
}

/** Play Kinkou to base; Pridestalker asks its +1 target as it triggers → the Huntress. Returns the trigger-order offer. */
async function playKinkou(game: Game): Promise<OrderDecision> {
  await game.p1.play("kinkou", { to: "base" });
  expect(game.p1.energy()).toBe(0);
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rengar" } });
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.key).toSorted() : []).toEqual(["huntress", "kinkou"]);
  await game.p1.pick("huntress");
  const order = game.decision();
  expect(order).toMatchObject({ kind: "order", seat: P1 });
  const o = order as OrderDecision;
  expect(o.items.map((i) => i.card).toSorted()).toEqual(["kinkou", "rengar"]);
  return o;
}

const keyOf = (o: OrderDecision, card: string) => o.items.find((i) => i.card === card)!.key;

describe("Ruling caca8247e718acf6 — order Pridestalker on top of Kinkou Initiate's trigger and the 4→5 buff lands before Kinkou checks", () => {
  test("both abilities trigger off the one play and P1 — controller of both — is offered their ORDER before anyone gets priority", async () => {
    const game = await board().build();
    await playKinkou(game);
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["kinkou", "rengar"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.zoneOf("kinkou")).toBe("base"); // the unit itself is already on the board
  });

  test("Kinkou first (bottom), Pridestalker last (top): Pridestalker resolves first → Huntress 5 while Kinkou's trigger still waits; then Kinkou resolves, sees 5, and P1 draws 1", async () => {
    const game = await board().build();
    const o = await playKinkou(game);
    await game.p1.order([keyOf(o, "kinkou"), keyOf(o, "rengar")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou", "rengar"]); // bottom → top
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Pridestalker resolves
    expect(game.state("huntress").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kinkou"]);
    expect(game.p1.hand()).toHaveLength(hand); // nothing drawn yet
    await game.p1.passPriority();
    await game.p2.passPriority(); // Kinkou's trigger resolves — checks NOW
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.state("kinkou").might).toBe(3); // "your OTHER units" — Kinkou's own 3 never counted
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the other order (Pridestalker bottom, Kinkou on top): Kinkou resolves first while the Huntress is still 4 → NO draw; the +1 lands afterwards", async () => {
    const game = await board().build();
    const o = await playKinkou(game);
    await game.p1.order([keyOf(o, "rengar"), keyOf(o, "kinkou")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rengar", "kinkou"]);
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Kinkou's trigger resolves at total 4
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.state("huntress").might).toBe(4);
    await game.settle();
    expect(game.state("huntress").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(hand); // checked on resolution, not retroactively
  });
});
