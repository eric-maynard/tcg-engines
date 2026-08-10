/**
 * Ruling 3a01784689b52f4a — Falling Star (ogn-029-298) × Not So Fast (sfd-045-221) × Abandon (unl-131-219)
 *   Falling Star: "Deal 3 to a unit. Deal 3 to a unit." (2 + [fury][fury])
 *   Not So Fast: "[Reaction] Counter an enemy spell or ability that chooses a friendly unit or gear." (2 + [calm])
 *   Abandon: "[Reaction] Counter a spell. Return it to its owner's hand instead of putting it in their trash. [Predict]." (2)
 *
 * Q: I play Falling Star, opponent reacts with Not So Fast — can I react with Abandon to counter my OWN Falling Star and
 *    get it back to hand?
 * A: Yes. LIFO chain: Falling Star → Not So Fast (targeting it) → Abandon (targeting Falling Star). Abandon resolves first,
 *    counters Falling Star and returns it to hand; Not So Fast then has no valid target and resolves with no effect.
 * Rules: 330–334 (chain, priority window after each addition, LIFO resolution), 425 (counter), fizzle on illegal target.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const NOT_SO_FAST = "sfd-045-221";
const ABANDON = "unl-131-219";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } }) // Falling Star (2 + fury fury) + Abandon (2)
    .resources(P2, { energy: 2, power: { calm: 1 } }) // Not So Fast
    .unit(P2, "base", { might: 4, name: "Target One" }, "t1")
    .unit(P2, "base", { might: 4, name: "Target Two" }, "t2")
    .hand(P1, FALLING_STAR, "fs")
    .hand(P1, ABANDON, "abandon")
    .hand(P2, NOT_SO_FAST, "nsf");
}

async function passChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 3a01784689b52f4a — Abandon your own Falling Star in response to Not So Fast: it returns to hand and Not So Fast fizzles", () => {
  test("the chain builds Falling Star → Not So Fast → Abandon, each addition opening a fresh priority window for the other player", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["t1", "t2"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs"]);
    await game.p1.passPriority();
    // P2's window: Not So Fast may counter Falling Star (an enemy spell choosing P2's units).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options).toEqual([["fs"]]);
    await game.p2.cast("nsf", { targets: "fs" });
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["fs", ["t1", "t2"]],
      ["nsf", ["fs"]],
    ]);
    // Not So Fast does NOT resolve immediately: priority comes back around to P1 with both spells still pending.
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("fs")).toBe("chain");
    // Abandon can name Falling Star (P1's own spell) while it is still on the chain.
    const abandonTargets = game.p1.option("cast", "abandon")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(abandonTargets).toContainEqual(["fs"]);
    await game.p1.cast("abandon", { targets: "fs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fs", "nsf", "abandon"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("resolution is LIFO: Abandon resolves first — Falling Star leaves the chain to P1's HAND — then Not So Fast finds no target and does nothing; no damage is dealt and nobody is refunded", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["t1", "t2"] });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "fs" });
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("abandon", { targets: "fs" });
    await passChain(game); // both pass → Abandon (top) resolves

    // Mid-resolution snapshot: Abandon's [Predict] asks P1; by now Falling Star is already back in hand and only NSF remains.
    const predict = game.decision();
    if (predict?.kind === "pick" && predict.seat === P1) {
      expect(game.zoneOf("fs")).toBe("hand");
      expect(game.chain().map((c) => c.cardId)).toEqual(["nsf"]);
      await game.p1.decline(); // keep the top card
    }
    await game.settle();

    expect(game.zoneOf("fs")).toBe("hand"); // countered → hand (Abandon's replacement), not trash
    expect(game.p1.hand()).toContain("fs");
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash"); // resolved with no legal target — no effect
    expect(game.state("t1").damage).toBe(0);
    expect(game.state("t2").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    // Costs stay paid on all sides.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Abandon, Not So Fast counters Falling Star to the TRASH and the targets take nothing", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["t1", "t2"] });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "fs" });
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("t1").damage).toBe(0);
    expect(game.state("t2").damage).toBe(0);
    expect(game.zoneOf("abandon")).toBe("hand");
  });
});
