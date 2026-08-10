/**
 * Ruling a95bd97c0a84637a — Get Excited! (OGN-008 → ogn-008-298) [Action] 2+[fury] "Discard 1. Deal its Energy cost as damage to a
 *   unit at a battlefield."  × Defy (OGN-045 → ogn-045-298) [Reaction] "Counter a spell that costs no more than [4] and no more than
 *   [rainbow]."  × Wind Wall (OGN-064 → ogn-064-298) [Reaction] "Counter a spell."
 *
 * Q: With Get Excited!, does the opponent see what is discarded before they can react / counter?
 * A: No. The unit is targeted as the spell goes on the chain, but the discard is part of RESOLUTION, not a cost: nothing is chosen or
 *    revealed until after the react window. If the spell is countered (Defy / Wind Wall) it never resolves, so nothing is discarded.
 * Rules: 355.5 (targets chosen at finalization), 356 (costs) vs 359 (effects on resolution), 425.1 (countered → no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const FODDER = { cardType: "unit", energyCost: 5, might: 5, name: "Fodder" } as const; // discard → 5 damage
const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap" } as const;

/** P1's turn, 2 energy + fury; hand: Get Excited, Fodder(5), Cheap(1). P2 holds bf1 with a 4-Might Guard and has Defy + Wind Wall with 4 energy + 3 calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FODDER, "fodder")
    .hand(P1, CHEAP, "cheap")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "windwall");
}

/** P1 casts Get Excited at the Guard and passes; P2 now holds priority with the spell on the chain. */
async function castAndPass(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ge", { targets: "guard" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling a95bd97c0a84637a — Get Excited!'s discard happens on resolution, after the react window", () => {
  test("on the chain: the target (Guard) is already declared, but NOTHING has been discarded — P1 still holds Fodder and Cheap and was not asked to pick — while P2 may react", async () => {
    const game = await board().build();
    await game.p1.cast("ge", { targets: "guard" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["guard"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // a priority window, not a discard pick
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]);
    expect(game.p1.trash()).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.can("cast", "windwall")).toBe(true);
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]); // still unknown to P2 how much it will hit for
  });

  test("unopposed: only when it RESOLVES is P1 asked what to discard; Fodder (cost 5) → 5 damage kills the 4-Might Guard", async () => {
    const game = await castAndPass();
    await game.p2.passPriority(); // resolves now
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["cheap", "fodder"]);
    await game.p1.pick("fodder");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Defy counters it: Get Excited never resolves — no discard prompt ever, both cards stay in hand, Guard untouched, no refund", async () => {
    const game = await castAndPass();
    await game.p2.cast("defy", { targets: "ge" });
    let discardAsked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        discardAsked = true;
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(discardAsked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]);
    expect(game.p1.trash()).toEqual(["ge"]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Wind Wall counters it just the same: no discard, no damage", async () => {
    const game = await castAndPass();
    await game.p2.cast("windwall", { targets: "ge" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]);
    expect(game.state("guard").damage).toBe(0);
  });
});
