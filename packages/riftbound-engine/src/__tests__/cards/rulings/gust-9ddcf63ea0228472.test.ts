/**
 * Ruling 9ddcf63ea0228472 — Gust (OGN-169 → ogn-169-298) [Reaction] [1] "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Baited Hook (OGN-242 → ogn-242-298) Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of
 *     your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *     ignoring its cost. Then recycle the rest."
 *
 * Q: Can I Gust the unit my opponent is Hooking (at a battlefield) to stop them getting a new unit?
 * A: Yes. The friendly unit is chosen as the ability goes on the chain (after costs); you may React with Gust. The Hook
 *    still resolves but kills nothing, so no unit may be played from the looked-at cards (null Might); the rest are
 *    recycled. No new target may be chosen and the Hook's costs stay paid.
 * Rules: 355/356 (targets chosen at finalization), 346 (Reaction window), 359.3.e.2/.12 (illegal target → skipped, null).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const BAITED_HOOK = "ogn-242-298";
const LOOKED = ["three", "one", "zero", "junk", "one2"];

/**
 * P2's turn (the Hook player). P2: Baited Hook ready, [1][order]; Bait (2 Might) at bf1 which P2 holds; a 4-Might Brute in
 * base (another friendly unit, so "no retarget" is observable). P2 deck top→: Three, One, Zero, Junk(spell), One, then Sixth.
 * P1 (me): Gust in hand + [1].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { order: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .gear(P2, BAITED_HOOK, "hook")
    .unit(P2, "bf1", { might: 2, name: "Bait" }, "bait")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .deck(
      P2,
      [
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 1, might: 0, name: "Zero" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Sixth" },
      ],
      [...LOOKED, "sixth"],
    )
    .hand(P1, GUST, "gust");
}

async function hookTheBait(game: Game): Promise<void> {
  await game.p2.activate("hook", 0, { targets: "bait" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // [1][order] paid
  expect(game.state("hook").isExhausted).toBe(true); // [Exhaust] paid
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P2, targets: ["bait"] })]);
}

describe("Ruling 9ddcf63ea0228472 — Gust the Hooked unit in response: the Hook resolves but gets nothing", () => {
  test("the Bait is chosen as the Hook goes on the chain (costs paid, unit not yet killed); I get priority and Gust may target it", async () => {
    const game = await board().build();
    await hookTheBait(game);
    expect(game.zoneOf("bait")).toBe("battlefield-bf1");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    const offered = new Set((game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[]);
    expect(offered.has("bait")).toBe(true); // 2 Might, at a battlefield
    expect(offered.has("brute")).toBe(false); // in base / 4 Might — not a Gust target
  });

  test("Gust resolves first (LIFO) and bounces the Bait; the Hook then still resolves: nothing killed, no unit offered, all 5 recycled, no retarget onto the Brute, costs stay paid", async () => {
    const game = await board().build();
    await hookTheBait(game);
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "bait" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "gust"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("bait")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      const d = game.decision();
      expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2 });
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      for (const c of LOOKED) {
        expect(offered).not.toContain(c); // not even Zero / One — the killed unit's Might is null, not 0
      }
      await game.p2.decline();
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bait")).toBe("hand"); // never killed
    expect(game.p2.trash()).not.toContain("bait");
    expect(game.zoneOf("brute")).toBe("base"); // no new target was chosen
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.units().sort()).toEqual(["brute"]); // no new unit was played
    expect(game.p2.deck()[0]).toBe("sixth");
    expect(game.p2.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: without Gust the Hook kills the Bait (2) and offers the looked-at units of Might ≤ 3", async () => {
    const game = await board().build();
    await hookTheBait(game);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.zoneOf("bait")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["one", "one2", "three", "zero"]);
  });
});
