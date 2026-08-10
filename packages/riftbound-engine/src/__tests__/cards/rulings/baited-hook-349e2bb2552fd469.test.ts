/**
 * Ruling 349e2bb2552fd469 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · 3
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *      from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle
 *      the rest."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: Is the unit targeted before or after the ability goes on the chain, and can the opponent respond to remove it?
 * A: The friendly unit is DECLARED as the ability is finalized (costs paid → target named → item on the chain); the
 *    opponent may then react. If the target is removed (e.g. Gust), the Hook still resolves: nothing is killed, you
 *    look at the top 5 and recycle everything (no valid Might to compare against).
 * Rules: 355 / 356 (choices + costs when playing an ability, then it is finalized), 346 (priority round after
 *        finalization), 359.3.e.2/.5/.12 (illegal target → not killed, its Might is null → no unit qualifies).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const GUST = "ogn-169-298";
const THREE = { cardType: "unit", energyCost: 3, might: 3, name: "Three" } as const;
const ONE = { cardType: "unit", energyCost: 1, might: 1, name: "One" } as const;
const ZERO = { cardType: "unit", energyCost: 1, might: 0, name: "Zero" } as const;
const JUNK = { cardType: "spell", energyCost: 1, name: "Junk" } as const;
const LOOKED_AT = ["three", "one", "zero", "junk", "one2"];

/**
 * P1's turn. Baited Hook ready in base with exactly [1][order]. Two friendly units so a real choice exists: the 2-Might
 * Bait at bf1 (Gust can reach it) and a 4-Might Brute in base. Deck top→: Three, One, Zero, Junk(spell), One, then Sixth.
 * P2 holds Gust with [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 2, name: "Bait" }, "bait")
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
    .deck(P1, [THREE, ONE, ZERO, JUNK, ONE, THREE], [...LOOKED_AT, "sixth"])
    .hand(P2, GUST, "gust");
}

async function activateHookOnBait(game: Game): Promise<void> {
  await game.p1.activate("hook", 0, { targets: "bait" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // [1][order] paid
  expect(game.state("hook").isExhausted).toBe(true); // [Exhaust] paid
}

describe("Ruling 349e2bb2552fd469 — Baited Hook's friendly unit is declared on activation; the opponent may react to remove it", () => {
  test("the target is part of finalizing the ability: activation DEMANDS the friendly unit up front (no target → ambiguous), before anything is on the chain", async () => {
    const game = await board().build();
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ min: 1, required: true });
    expect(new Set((field?.options ?? []).flat() as string[])).toEqual(new Set(["bait", "brute"]));
    const r = await game.p1.try((p) => p.activate("hook"));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("hook").isExhausted).toBe(false); // nothing paid, nothing finalized
  });

  test("pay [1][order] + exhaust, name the Bait → ONE chain item that already carries the target; the opponent gets priority to react exactly once, at that point", async () => {
    const game = await board().build();
    await activateHookOnBait(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1, targets: ["bait"] })]);
    expect(game.zoneOf("bait")).toBe("battlefield-bf1"); // not killed yet — killing is the effect, on resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = new Set((game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[]);
    expect(offered.has("bait")).toBe(true);
  });

  test("Gust in response resolves first and returns the Bait to hand; the Hook then STILL resolves: nothing is killed, no unit among the top 5 may be taken, and all five are recycled (Sixth is the new top)", async () => {
    const game = await board().build();
    await activateHookOnBait(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "bait" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves (LIFO)
    expect(game.zoneOf("bait")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
    // Now the Hook resolves.
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      // If the look-at-5 step is surfaced at all it must be declinable and offer no unit (null Might comparison).
      const d = game.decision();
      expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      for (const c of LOOKED_AT) {
        expect(offered).not.toContain(c);
      }
      await game.p1.decline();
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bait")).toBe("hand"); // never killed
    expect(game.p1.trash()).not.toContain("bait");
    expect(game.zoneOf("brute")).toBe("base"); // no substitute target is picked
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["brute"]); // nothing was played
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-5).sort()).toEqual([...LOOKED_AT].sort());
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // costs stay paid
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the Hook kills the Bait (2 Might) and offers units of Might ≤ 3 from the top 5 (Three, One, Zero, One — not the spell)", async () => {
    const game = await board().build();
    await activateHookOnBait(game);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.zoneOf("bait")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["one", "one2", "three", "zero"]);
  });
});
