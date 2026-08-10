/**
 * Ruling 06a652f48672b55a — Blue Sentinel (UNL-087 → unl-087-219) × Chem-Baroness (SFD-201 → sfd-201-221) × Gold (sfd-t03)
 *   Blue Sentinel: "[Shield 2] Your hold effects for holding here trigger an additional time. When I hold,
 *   [Add] [rainbow] at the start of your next Main Phase."
 *   Chem-Baroness (Renata legend): "When you or an ally hold, you may exhaust me to play a Gold gear token exhausted."
 *
 * Q: Blue Sentinel holds while I play the Renata legend — do I get 2 Golds?
 * A: No. Blue Sentinel makes Chem-Baroness's hold effect trigger twice (two chain items), but the second
 *    instance cannot pay "exhaust me" — the legend is already exhausted from the first — so only ONE Gold.
 * Rules: 383.3.b (a triggered ability's cost is its base cost), 414.1.b / 414.4 (an exhausted object cannot
 *        be exhausted again to pay a cost), 383.4.d (hold effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";
const CHEM_BARONESS = "sfd-201-221";

const golds = (game: Game) => game.p1.base().filter((id) => game.state(id).name === "Gold");

/** End of P2's turn 2. P1 (Chem-Baroness) controls bf1 with Blue Sentinel standing there → P1 holds bf1 at the start of turn 3. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, CHEM_BARONESS, "renata")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", BLUE_SENTINEL, "sentinel");
}

/** Answer every Beginning-Phase prompt: yes when payable, no when not; accept trigger order; pass otherwise. */
async function drainHoldPrompts(game: Game): Promise<{ asked: number; payable: number }> {
  let asked = 0;
  let payable = 0;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "renata") {
      expect(d.seat).toBe(P1);
      asked += 1;
      if (d.canAccept === false) {
        await game.p1.no();
      } else {
        payable += 1;
        await game.p1.yes();
      }
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      await game.acting().pass();
    }
  }
  await game.settle();
  return { asked, payable };
}

describe("Ruling 06a652f48672b55a — Blue Sentinel doubles Chem-Baroness's hold trigger, but 'exhaust me' pays only once: one Gold", () => {
  test("control (no Blue Sentinel, vanilla holder): one hold → ONE Chem-Baroness trigger → one Gold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, CHEM_BARONESS, "renata")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Plain Holder" }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().filter((c) => c.cardId === "renata")).toHaveLength(1);
    const r = await drainHoldPrompts(game);
    expect(r.asked).toBe(1);
    expect(golds(game)).toHaveLength(1);
  });

  test("with Blue Sentinel holding bf1: P1 scores the hold point once, and Chem-Baroness's hold effect is put on the chain TWICE (383.4.d + 'trigger an additional time')", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // holding scores once — only hold *effects* are doubled
    expect(game.state("renata").isReady).toBe(true); // Awaken readied it before the Beginning Phase
    expect(game.chain().filter((c) => c.cardId === "renata" && c.triggered && c.controller === P1)).toHaveLength(2);
  });

  test("first instance: P1 says yes → legend exhausted, one exhausted Gold; second instance: the exhaust cost cannot be paid again (414.1.b / 414.4) → no second Gold. Net: exactly ONE Gold", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    const r = await drainHoldPrompts(game);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(r.asked).toBeGreaterThanOrEqual(1);
    expect(r.payable).toBe(1); // only one of the two instances could actually be paid for
    expect(game.state("renata").isExhausted).toBe(true);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Blue Sentinel's own 'When I hold' rider is also 'a hold effect for holding here' → it too triggers twice: [rainbow]×2 is added at the start of the Main Phase", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await drainHoldPrompts(game); // [Add] abilities can't be reacted to — they never wait on the chain
    expect(game.phase()).toBe("main");
    expect(game.p1.power("rainbow")).toBe(2);
  });
});
