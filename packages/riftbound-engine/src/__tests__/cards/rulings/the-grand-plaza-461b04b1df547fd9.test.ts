/**
 * Ruling 461b04b1df547fd9 — The Grand Plaza (OGN-293 → ogn-293-298) · Battlefield
 *   "When you hold here, if you have 7+ units here, you win the game."
 *
 * Q: Can I react to the Grand Plaza "checking" each turn whether 7 units hold it, even when there aren't 7?
 * A: No. It is a triggered ability with an "if" condition (383.2.a.1 / 383.3.e): it only becomes a chain item if
 *    you have 7+ units there at the moment you hold. With 6 or fewer the condition fails, nothing is put on the
 *    chain, and no priority window opens for anyone to react or add units.
 * Rules: 383.2.a.1 (intervening "if" = part of the trigger condition), 383.3.e, 469.2 (hold), 315.2 (Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_PLAZA = "ogn-293-298";
const GUST = "ogn-169-298"; // a Reaction P2 would love to fire "in response"

/** End of P2's turn 2. P1 controls the Plaza (live text) with `n` 1-Might Citizens; P2 holds Gust + a chaos rune to pay for it. */
function plaza(n: number) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false })
    .battlefield("other", { controller: null })
    .rune(P2, "chaos", { alias: "p2rune" })
    .hand(P2, GUST, "gust");
  for (let i = 0; i < n; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  return b;
}

describe("Ruling 461b04b1df547fd9 — with fewer than 7 units the Grand Plaza never triggers, so there is nothing to react to", () => {
  test("6 units: P1 holds the Plaza at the start of the turn — NO chain item is created and P2 never receives priority; the game flows straight to P1's main phase with the ordinary hold point", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]); // condition false → not placed on the chain (383.2.a.1)
    // Walk to the open main phase, recording whether P2 was ever handed a decision.
    let p2HadPriority = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d) break;
      if (d.seat === P2) p2HadPriority = true;
      if (d.kind === "action" && d.context === "main") break;
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(p2HadPriority).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("gust")).toBe("hand"); // P2 never had a window to cast it
    expect(game.violations()).toEqual([]);
  });

  test("contrast — 7 units: the trigger IS a chain item in P1's Beginning Phase, and P2 does get priority to react (e.g. Gust) before it resolves", async () => {
    const game = await plaza(7).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune("p2rune");
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("0 units elsewhere don't help: 6 at the Plaza + 3 in base is still 'fewer than 7 here' → no trigger, no window", async () => {
    const game = await plaza(6)
      .unit(P1, "base", { might: 1 }, "b1")
      .unit(P1, "base", { might: 1 }, "b2")
      .unit(P1, "base", { might: 1 }, "b3")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.isOver()).toBe(false);
  });
});
