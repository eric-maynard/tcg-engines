/**
 * Ruling aa92c6a1d6765627 — Cleave (OGN-004 → ogn-004-298) [Action] [1] "Give a unit [Assault 3] this turn."
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ Defy ogn-045-298 [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]" as Player A's own Reaction.)
 *
 * Q: Can Reactions be played mid-chain (stack-like), several deep, before earlier spells resolve?
 * A: Yes. A spell (Cleave) → opponent's Reaction → your Reaction on top; the chain resolves last-in-first-out. Spells can fizzle
 *    if their requirements are gone: if Gust returns Cleave's target to hand before Cleave resolves, Cleave does nothing.
 * Rules: 327–340 (chain: finalize/priority/pass/resolve, LIFO), 338.1.a (Reactions are legal mid-chain), 359.3.e (illegal target → skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const GUST = "ogn-169-298";
const DEFY = "ogn-045-298";

/** P1's turn. P1 holds bf1 with a 2-Might Scout; hand Cleave + Defy with 2 energy + 1 calm. P2: Gust + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DEFY, "defy")
    .hand(P2, GUST, "gust");
}

/** Cleave on Scout → P1 passes → P2 Gusts the Scout → P2 passes: P1 holds priority with [cleave, gust] on the chain. */
async function cleaveThenGust(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true); // a Reaction is legal with Cleave still unresolved
  await game.p2.cast("gust", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "gust"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling aa92c6a1d6765627 — Reactions stack mid-chain and resolve last-in-first-out", () => {
  test("Player A may answer the Reaction with ANOTHER Reaction before anything resolves: Cleave → Gust → Defy sit on one chain, three deep", async () => {
    const game = await cleaveThenGust();
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "gust" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "gust", "defy"]);
    expect(game.locationOf("scout")).toBe("bf1"); // nothing has resolved yet
    expect(game.state("scout").grantedKeywords).toEqual([]);
  });

  test("LIFO: Defy resolves first (counters Gust), Gust does nothing, then Cleave resolves last and the Scout gets Assault 3", async () => {
    const game = await cleaveThenGust();
    await game.p1.cast("defy", { targets: "gust" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).not.toContain("defy");
    expect(game.chain().map((c) => c.cardId)).toContain("cleave"); // the oldest item is still waiting
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf1"); // Gust was countered
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("scout").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.violations()).toEqual([]);
  });

  test("fizzle: if Player A just passes, Gust (last in) resolves first and bounces the Scout; Cleave then resolves with no legal target and does nothing", async () => {
    const game = await cleaveThenGust();
    await game.p1.passPriority(); // both passed in succession → Gust resolves
    expect(game.zoneOf("scout")).toBe("hand");
    await game.settle(); // Cleave resolves (fizzles)
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").grantedKeywords).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // Cleave's [1] stays spent
    expect(game.violations()).toEqual([]);
  });
});
