/**
 * Ruling c0ec0cb3a2327a0c — Amateur Recital (UNL-207 → unl-207-219) "When you hold here, you may move a unit at a battlefield to its
 *   base." × The Papertree (SFD-219 → sfd-219-221) "When you hold here, each player channels 1 rune exhausted."
 *
 * Q: Holding both at the start of my turn, can I use Amateur Recital's trigger to pull my unit off The Papertree and so dodge the
 *    Papertree's hold trigger / hold point?
 * A: No. Holding is evaluated for all your battlefields at once in the Beginning Phase: both points are scored and BOTH hold
 *    triggers are put on the chain. A trigger on the chain is independent of the unit that caused it — even if the Recital
 *    trigger resolves first and moves the unit home, the Papertree trigger still resolves.
 * Rules: 383.4.d.2.a/c (hold triggers are placed on the chain; moving the unit later doesn't undo them), 383.3.d (you order them).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMATEUR_RECITAL = "unl-207-219";
const THE_PAPERTREE = "sfd-219-221";

/** End of P2's turn. P1 holds the live Recital (bf1, Singer) AND the live Papertree (bf2, Reader). Nobody has runes channeled. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1, def: AMATEUR_RECITAL, inert: false })
    .battlefield("bf2", { controller: P1, def: THE_PAPERTREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Singer" }, "singer")
    .unit(P1, "bf2", { might: 3, name: "Reader" }, "reader")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** P2 ends the turn → P1's Beginning Phase. */
async function intoP1Beginning(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.points()).toBe(0);
  expect(game.p2.runes()).toHaveLength(0);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling c0ec0cb3a2327a0c — Amateur Recital can't retroactively un-hold The Papertree", () => {
  test("entering the Beginning Phase P1 has ALREADY scored both holds (+2) and BOTH hold triggers (Recital bf1, Papertree bf2) are on the chain before anything resolves", async () => {
    const game = await intoP1Beginning();
    expect(game.p1.points()).toBe(2);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["bf1", "bf2"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.zoneOf("reader")).toBe("battlefield-bf2");
  });

  test("P1 opts into the Recital ('you may'), CHOOSES the Reader at the Papertree, and is asked to ORDER its two simultaneous triggers — P1 puts the Recital on top so it resolves first", async () => {
    const game = await intoP1Beginning();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toMatch(/Amateur Recital/);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const pick = game.decision();
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["reader", "singer"]);
    await game.p1.pick("reader");
    const order = game.decision();
    expect(order).toMatchObject({ kind: "order", seat: P1 });
    const items = order?.kind === "order" ? order.items : [];
    const recital = items.find((i) => i.card === "bf1")?.key as string;
    const papertree = items.find((i) => i.card === "bf2")?.key as string;
    await game.p1.order([papertree, recital]); // Papertree bottom, Recital top
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf2", "bf1"]);
  });

  test("the Recital resolves first and moves the Reader home — yet the Papertree trigger is STILL on the chain and then resolves: each player channels 1 rune exhausted; P1 keeps both points", async () => {
    const game = await intoP1Beginning();
    await game.p1.yes();
    await game.p1.pick("reader");
    const order = game.decision();
    const items = order?.kind === "order" ? order.items : [];
    await game.p1.order([items.find((i) => i.card === "bf2")?.key as string, items.find((i) => i.card === "bf1")?.key as string]);
    // Resolve the top item (Recital).
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("reader")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf2", controller: P1, triggered: true })]);
    expect(game.p2.runes()).toHaveLength(0);
    // Resolve the Papertree.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.runes()).toHaveLength(1); // P2 only channels on P1's turn because the Papertree resolved
    expect(game.p2.runes({ ready: false })).toHaveLength(1); // …exhausted
    expect(game.p1.runes({ ready: false }).length).toBeGreaterThanOrEqual(1);
    expect(game.p1.points()).toBe(2); // nothing was taken back
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p1.runes()).toHaveLength(3); // 1 (Papertree, exhausted) + 2 (Channel Phase)
    expect(game.violations()).toEqual([]);
  });
});

void P2;
