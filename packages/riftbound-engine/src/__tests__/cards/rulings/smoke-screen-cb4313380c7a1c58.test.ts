/**
 * Ruling cb4313380c7a1c58 — Smoke Screen (ogn-093-298) × Baited Hook (ogn-242-298)
 *   Smoke Screen — [Reaction] · [2][mind]: "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   Baited Hook — Gear: "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *   banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost.
 *   Then recycle the rest."
 *
 * Q: Can I Smoke Screen the opponent's unit targeted by Baited Hook before it is killed?
 * A: Yes — Smoke Screen is a Reaction played while the Hook ability is on the chain; it resolves first, so the unit is
 *    killed at its REDUCED Might (min 1) and the Hook's ceiling becomes that value +1: a 4-Might unit dropped to 1 only
 *    fetches Might ≤ 2 instead of ≤ 5.
 * Rules: 332/333 (Closed state, LIFO), 359.3.f.2 (Might read when the kill executes).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const BAITED_HOOK = "ogn-242-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: Baited Hook ready, a 4-Might Bait in base, exactly [1][order]; deck top→ Five(5) Four(4) Three(3) Two(2)
 * Junk(spell). P2: Smoke Screen + exactly [2][mind].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 4, name: "Bait" }, "bait")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
      ],
      ["five", "four", "three", "two", "junk"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/** P1 activates the Hook on the Bait; stop at P2's priority with the ability on the chain. */
async function hookOnChain(game: Game): Promise<void> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  expect(game.chain()).toHaveLength(1);
  expect(game.chain()[0]).toMatchObject({ cardId: "hook", controller: P1 });
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** Pass/settle until the Hook's look-at-5 offer is up for P1. */
async function toLookOffer(game: Game): Promise<Pick> {
  await game.settle();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P1);
  return d as Pick;
}

const offered = (d: Pick) => d.options.map((o) => o.card ?? o.key).sort();

describe("Ruling cb4313380c7a1c58 — Smoke Screen in response shrinks the unit Baited Hook kills, and with it the fetch ceiling", () => {
  test("control: no response — the 4-Might Bait dies at 4, ceiling 5: Five, Four, Three and Two are all offered", async () => {
    const game = await board().build();
    await hookOnChain(game);
    const d = await toLookOffer(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["five", "four", "three", "two"]);
  });

  test("the Bait is still on the board (a legal 'unit') while the Hook ability is on the chain, so P2 may cast the [Reaction] Smoke Screen on it; it lands on top", async () => {
    const game = await board().build();
    await hookOnChain(game);
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "bait" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook", "smoke"]);
  });

  test("LIFO: Smoke Screen resolves first — the Bait is 4−4 → floored at 1 Might while the Hook is still pending", async () => {
    const game = await board().build();
    await hookOnChain(game);
    await game.p2.cast("smoke", { targets: "bait" });
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "smoke"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait").might).toBe(1);
  });

  test("then Baited Hook kills the Bait at Might 1 → ceiling 2: only Two is offered (not Five/Four/Three); picking it plays Two for free and recycles the rest", async () => {
    const game = await board().build();
    await hookOnChain(game);
    await game.p2.cast("smoke", { targets: "bait" });
    const d = await toLookOffer(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["two"]);
    expect(d.allowDecline).toBe(true);
    await game.p1.pick("two");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("two")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    for (const rest of ["five", "four", "three", "junk"]) {
      expect(game.zoneOf(rest)).toBe("mainDeck");
    }
    expect(game.violations()).toEqual([]);
  });
});
