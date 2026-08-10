/**
 * Ruling 079a0b04340b79a5 — Blue Sentinel (UNL-087 → unl-087-219) · Mind Unit · [4][mind] · 4 Might
 *   "[Shield 2] Your hold effects for holding here trigger an additional time. When I hold, [Add] [rainbow] at the start
 *    of your next Main Phase."
 *
 * Q: Does Blue Sentinel's passive make its OWN "When I hold" trigger an additional time?
 * A: Yes — the passive does not say "other" hold effects, so its own hold trigger fires twice: holding with Blue Sentinel
 *    adds 2 power at the start of your next Main Phase.
 * Rules: 383.4.d (hold effects), 469.2 (Hold in the Beginning Phase), 316.3–316.4 (Main Phase start; delayed [Add]),
 *        passive modifiers apply to the card's own triggered abilities unless excluded.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";

/** End of P2's turn 2; P1 controls bf1 with `holder` standing there → P1 holds bf1 at the start of turn 3. */
function aboutToHold(holder: "sentinel" | "vanilla") {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry");
  return holder === "sentinel"
    ? b.unit(P1, "bf1", BLUE_SENTINEL, "sentinel")
    : b.unit(P1, "bf1", { might: 4, name: "Plain Holder" }, "plain").unit(P1, "base", BLUE_SENTINEL, "sentinel");
}

/** P2 ends the turn; drive P1's Beginning Phase (accept trigger order / pass) into P1's open Main Phase, counting Sentinel items seen. */
async function intoP1Main(game: Game): Promise<number> {
  await game.p2.endTurn();
  let maxSentinelItems = game.chain().filter((c) => c.cardId === "sentinel" && c.triggered).length;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    maxSentinelItems = Math.max(maxSentinelItems, game.chain().filter((c) => c.cardId === "sentinel" && c.triggered).length);
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  await game.settle();
  return maxSentinelItems;
}

describe("Ruling 079a0b04340b79a5 — Blue Sentinel doubles its own hold trigger: 2 power next Main Phase", () => {
  test("holding bf1 WITH Blue Sentinel: the hold scores once, and at the start of P1's Main Phase the pool holds [rainbow]×2 (the 'When I hold' [Add] happened twice)", async () => {
    const game = await aboutToHold("sentinel").build();
    expect(game.p1.power()).toBe(0);
    await intoP1Main(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // holding itself is scored once — only hold EFFECTS are doubled
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.p1.power()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — 'for holding HERE': a plain unit holds bf1 while Blue Sentinel sits in base → Sentinel does not hold, no [Add] at all (0 power), still 1 hold point", async () => {
    const game = await aboutToHold("vanilla").build();
    const seen = await intoP1Main(game);
    expect(seen).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.power()).toBe(0);
  });

  test("the added power is real, spendable power in that Main Phase (it was delayed past the pool-emptying at phase start): P1 can pay a [rainbow][rainbow]-style cost with it", async () => {
    const game = await aboutToHold("sentinel")
      .hand(P1, { cardType: "unit", energyCost: 0, might: 2, name: "Prism Recruit", powerCost: ["rainbow", "rainbow"] }, "prism")
      .build();
    await intoP1Main(game);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.p1.can("play", "prism")).toBe(true);
    await game.p1.play("prism", { to: "base" });
    await game.settle();
    expect(game.zoneOf("prism")).toBe("base");
    expect(game.p1.power()).toBe(0);
  });
});
