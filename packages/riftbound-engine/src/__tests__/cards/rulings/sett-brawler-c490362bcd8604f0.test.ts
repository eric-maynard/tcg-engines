/**
 * Ruling c490362bcd8604f0 — Sett, Brawler (OGN-164 → ogn-164-298) · Champion · Body · 5 · 4 Might
 *   "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield · "When you conquer here, you may spend a buff to draw 1."
 *   (× Kinkou Monk ogn-141-298 — cited only as a contrast; not part of the line.)
 *
 * Q: A BUFFED Sett conquers the Monastery. Do the two "when … conquer" triggers chain together — can I use the
 *    Monastery to draw (spending Sett's buff) and then have Sett's own trigger re-buff him?
 * A: Yes. Both triggers go on the chain at the same time; you control both and choose their order. Spend Sett's buff
 *    for the Monastery's draw, then Sett's trigger resolves and — having no buff any more — he gets one. Sett's trigger
 *    is added even though he was already buffed (legality isn't checked when a trigger is put on the chain).
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.3.b (the Monastery's "you may spend a buff" is its
 *        cost, paid to put it on the chain), 336–340 (LIFO), 702.3 (one buff at a time).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const MONASTERY = "ogn-282-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** P1's turn. P2 holds the LIVE Monastery with Weak (1). A BUFFED Sett (4 + 1 = 5) ready in P1's base — the only buff around. */
function board() {
  return scenario()
    .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
    .unit(P2, "mon", { might: 1, name: "Weak" }, "weak")
    .unit(P1, "base", SETT, "sett", { buffed: true });
}

/** Sett attacks and conquers the Monastery (5 into 1); stops at the first prompt after the conquer. */
async function settConquers(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  await game.p1.move("sett", "mon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const d = game.decision();
  if (d?.kind === "distribute") {
    await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
  }
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.mon?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

const key = (d: OrderD, card: string) => d.items.find((i) => i.card === card)?.key as string;

describe("Ruling c490362bcd8604f0 — buffed Sett conquers the Monastery: spend his buff to draw, then his own trigger re-buffs him", () => {
  test("on conquering, BOTH triggers are pending on the chain at once — Sett's included although he is already buffed — and P1 is asked whether to pay the Monastery's 'spend a buff' (Sett's is the only buff)", async () => {
    const game = await settConquers();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["mon", "sett"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mon" } });
    expect(game.state("sett").isBuffed).toBe(true); // nothing spent before P1 opts in
  });

  test("P1 opts in (Sett's buff is spent for it) and — controlling both triggers — is offered their ORDER", async () => {
    const game = await settConquers();
    await game.p1.yes();
    for (let i = 0; i < 2 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.pick("sett"); // name the buff to spend, if asked
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as OrderD).items.map((i) => i.card).sort()).toEqual(["mon", "sett"]);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 }); // the Monastery's cost: his buff
  });

  test("Monastery on top resolves first (P1 draws 1), then Sett's trigger: he has no buff now, so he is buffed again — end state: Sett buffed (5), hand +1, 1 point", async () => {
    const game = await settConquers();
    const hand = game.p1.hand().length;
    await game.p1.yes();
    for (let i = 0; i < 2 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.pick("sett");
    }
    const od = game.decision() as OrderD;
    expect(od.kind).toBe("order");
    await game.p1.order([key(od, "sett"), key(od, "mon")]); // first = bottom, last = top → Monastery resolves first
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett", "mon"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Monastery: draw 1
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sett: buff me — succeeds, he had none
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.points()).toBe(1);
    // and the fresh buff is spendable again for +4
    expect(game.p1.can("activate", "sett")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("declining the Monastery instead: only Sett's trigger remains; buffing an already-buffed Sett does nothing (still exactly one buff, 5) and no card is drawn", async () => {
    const game = await settConquers();
    const hand = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toHaveLength(hand);
  });
});
