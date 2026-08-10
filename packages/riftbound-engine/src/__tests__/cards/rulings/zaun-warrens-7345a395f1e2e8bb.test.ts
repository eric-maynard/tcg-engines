/**
 * Ruling 7345a395f1e2e8bb — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield "When you conquer here, discard 1, then draw 1."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Spell "Deal 5 to a unit. When you conquer, you may discard 1 to
 *     return this from your trash to your hand."
 *
 * Q: Conquering Zaun Warrens while SMDR is in my trash — two conquer triggers at once. Can I choose the order they stack?
 * A: Yes. When multiple triggers you control trigger simultaneously, you choose the order they go on the chain (this is
 *    general, not conquer-specific).
 * Rules: 383.3 / 383.3.d (simultaneous triggers of one controller: that player orders them), 340 (LIFO resolution).
 *
 * Engine note: SMDR's "you may discard 1" is asked (and paid) as the trigger is added; the order offer follows it.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const SMDR = "ogn-252-298";
const GUST = "ogn-169-298"; // filler cards to discard

type OrderD = Extract<Decision, { kind: "order" }>;

/** P1's turn. Uncontrolled live Zaun Warrens; P1's Scout (2) in base; SMDR in P1's trash; two spare cards in hand. */
function board() {
  return scenario()
    .battlefield("warrens", { controller: null, def: ZAUN_WARRENS, inert: false })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .trash(P1, SMDR, "rocket")
    .hand(P1, GUST, "spare1")
    .hand(P1, GUST, "spare2");
}

/** Scout walks onto the empty Warrens and conquers; accept SMDR's opt-in (discarding spare1) and stop at P1's trigger-order offer. */
async function conquerToOrder(game: Game): Promise<OrderD> {
  await game.p1.move("scout", "warrens");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind === "order") {
      break;
    }
    if (d.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      expect(d.prompt).toMatch(/Super Mega Death Rocket/);
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("spare1"); // SMDR's discard cost
    } else {
      break;
    }
  }
  expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  return d as OrderD;
}

const key = (d: OrderD, card: string) => d.items.find((i) => i.card === card)?.key as string;

/** Pass priority until the chain shrinks below `len` or a non-action prompt appears. */
async function resolveTop(game: Game, len: number): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length === len; i++) {
    const p = game.decision();
    if (p?.kind !== "action" || p.context === "main") {
      return;
    }
    await game.seat(p.seat).pass();
  }
}

describe("Ruling 7345a395f1e2e8bb — simultaneous conquer triggers (Zaun Warrens + SMDR in trash): their controller picks the order", () => {
  test("on conquering, BOTH triggers hit the chain together, both P1's, and P1 is offered an ORDER decision over exactly {Warrens, Rocket}", async () => {
    const game = await board().build();
    const d = await conquerToOrder(game);
    expect(d.items.map((i) => i.card).toSorted()).toEqual(["rocket", "warrens"]);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  });

  test("P1 stacks Rocket on TOP: it resolves first and returns to hand — so it is even a legal discard for the Warrens trigger that resolves next", async () => {
    const game = await board().build();
    const d = await conquerToOrder(game);
    await game.p1.order([key(d, "warrens"), key(d, "rocket")]); // first = bottom, last = top
    expect(game.chain().map((c) => c.cardId)).toEqual(["warrens", "rocket"]);
    await resolveTop(game, 2);
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["warrens"]);
    const deck = game.p1.deck().length;
    await resolveTop(game, 1);
    const p = game.decision();
    expect(p).toMatchObject({ kind: "pick", seat: P1 });
    expect((p as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["rocket", "spare2"]);
    await game.p1.pick("rocket");
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.zoneOf("spare2")).toBe("hand");
    expect(game.p1.deck()).toHaveLength(deck - 1); // then draw 1
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("…or Warrens on TOP: its discard (only spare2 available — SMDR is still in the trash) and draw resolve first; then the Rocket trigger returns SMDR to hand", async () => {
    const game = await board().build();
    const d = await conquerToOrder(game);
    await game.p1.order([key(d, "rocket"), key(d, "warrens")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rocket", "warrens"]);
    const deck = game.p1.deck().length;
    await resolveTop(game, 2);
    const p = game.decision();
    expect(p).toMatchObject({ kind: "pick", seat: P1 });
    expect((p as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card ?? o.key)).toEqual(["spare2"]);
    expect(game.zoneOf("rocket")).toBe("trash");
    await game.p1.pick("spare2");
    expect(game.zoneOf("spare2")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rocket"]);
    await resolveTop(game, 1);
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(2); // drawn card + Rocket
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
