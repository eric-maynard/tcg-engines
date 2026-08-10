/**
 * Ruling dadac78067b2950e — Get Excited! (OGN-008 → ogn-008-298) · [Action] · [2]+[fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · [Reaction] "Counter a spell."
 *
 * Q: When I play Get Excited, do I discard first and then play, or not right away?
 * A: Not right away. The discard is not a cost — it is part of resolution. Cast (declare the target) → chain → opponent
 *    may react → on resolution you choose and discard, dealing that card's Energy cost. Countered (Defy / Wind Wall) ⇒
 *    no discard at all. Target removed/invalid before resolution ⇒ the spell still resolves and you MUST still discard,
 *    but no damage is dealt.
 * Rules: 355.5 (targets at finalization), 356 (costs) vs 359 (instructions on resolution), 359.3.e.5 (illegal target ⇒
 *        that instruction is skipped, the rest still happens), 425.1 (countered ⇒ never resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const GUST = "ogn-169-298"; // [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
const FODDER = { cardType: "unit", energyCost: 5, might: 5, name: "Fodder" } as const;
const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap" } as const;

/**
 * P1's turn, exactly [2]+[fury]. Hand: Get Excited, Fodder (5), Cheap (1). P2 holds bf1 with a 3-Might Guard (Gust-able)
 * and has Defy, Wind Wall and Gust in hand with 5 energy + 3 calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 5, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf1", { might: 6, name: "Anchor" }, "anchor")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FODDER, "fodder")
    .hand(P1, CHEAP, "cheap")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, GUST, "gust");
}

/** Step 1+2: P1 casts Get Excited declaring Guard as the target; it sits on the chain; P1 passes → P2's react window. */
async function castAndPass(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ge", { targets: "guard" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["guard"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // the COST is paid now …
  expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]); // … but nothing is discarded yet
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no discard prompt at play time
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // Step 3: opponent may react
  return game;
}

/** Drive priority passes until something other than a chain priority window shows up; report whether P1 was ever asked to pick. */
async function drainChain(game: Game): Promise<boolean> {
  let p1Picked = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      p1Picked = true;
      break;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  return p1Picked;
}

describe("Ruling dadac78067b2950e — Get Excited!'s discard happens on resolution, not when it is played", () => {
  test("1–3. Cast: the target is declared and the cost paid, but no card is discarded; the spell waits on the chain and the opponent gets to react", async () => {
    const game = await castAndPass();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.can("cast", "windwall")).toBe(true);
    expect(game.p1.trash()).toEqual([]);
  });

  test("4. Resolve: only now does P1 choose and discard — Fodder (cost 5) → 5 damage kills the 3-Might Guard", async () => {
    const game = await castAndPass();
    await game.p2.passPriority(); // both passed → resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["cheap", "fodder"]);
    await game.p1.pick("fodder");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.hand()).toEqual(["cheap"]);
    expect(game.violations()).toEqual([]);
  });

  test("No discard on counter (Defy): Get Excited never resolves — P1 is never asked to discard, keeps both cards, Guard untouched", async () => {
    const game = await castAndPass();
    await game.p2.cast("defy", { targets: "ge" });
    const asked = await drainChain(game);
    expect(asked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]);
    expect(game.p1.trash()).toEqual(["ge"]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // no refund either
  });

  test("No discard on counter (Wind Wall): same outcome", async () => {
    const game = await castAndPass();
    await game.p2.cast("windwall", { targets: "ge" });
    const asked = await drainChain(game);
    expect(asked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["cheap", "fodder"]);
    expect(game.state("guard").damage).toBe(0);
  });

  // With its lone target gone, Get Excited still resolves: "Discard 1" is an independent instruction and is
  // still performed (359.3.e.5), only the damage is skipped.
  test("ruling dadac78067b2950e — Invalid target: P2 Gusts the Guard in response — Get Excited still resolves, P1 MUST still discard, but no damage is dealt", async () => {
    const game = await castAndPass();
    await game.p2.cast("gust", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ge", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves (LIFO): Guard → P2's hand
    expect(game.zoneOf("guard")).toBe("hand");
    // Get Excited resolves next: the discard is still demanded (not optional).
    const asked = await drainChain(game);
    expect(asked).toBe(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["cheap", "fodder"]);
    await game.p1.pick("fodder");
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // …but its target is no longer "a unit at a battlefield": no damage lands anywhere.
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("anchor").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
