/**
 * Ruling 071358d8835164b8 — Cleave (OGN-004 → ogn-004-298) · Action spell · [1] · "Give a unit [Assault 3] this turn."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Cleave is on the chain targeting a 4-Might unit. The opponent holds Stupefy and Gust — can they
 *    Gust the 4-Might unit by first Stupefying it?
 * A: Not directly — a 4-Might unit is not a legal Gust target until Stupefy has RESOLVED. Sequence:
 *    Cleave → Stupefy in response → Stupefy resolves (unit now 3 Might) → priority passes around again
 *    (the next link's owner first) → Gust is cast → Gust resolves → Cleave resolves. Players may keep
 *    adding to the chain as items resolve.
 * Rules: 336–340 (chain, priority after each resolution, LIFO), 355.8 (no legal target ⇒ can't play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const STUPEFY = "ogn-095-298";
const GUST = "ogn-169-298";

/** P1's turn. P1's 4-Might Brute at bf1; P1 has exactly [1] for Cleave. P2 holds Stupefy + Gust with exactly [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Brute" }, "brute")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, GUST, "gust");
}

/** P1 casts Cleave on Brute and passes → P2 has priority with Cleave alone on the chain. */
async function cleaveOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "brute" });
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** From P2's priority over [cleave]: Stupefy Brute and let it resolve (P2 passes, P1 passes). */
async function stupefyResolves(game: Game): Promise<void> {
  await game.p2.cast("stupefy", { targets: "brute" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "stupefy"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Stupefy resolves (LIFO); Cleave still pending
  expect(game.zoneOf("stupefy")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
}

describe("Ruling 071358d8835164b8 — Gust needs Stupefy to RESOLVE first; then it fits in before Cleave resolves", () => {
  test("with Cleave pending, Gust is NOT castable on the 4-Might Brute (not a legal target, 355.8) — Stupefy is", async () => {
    const game = await cleaveOnChain();
    expect(game.state("brute").might).toBe(4);
    expect(game.p2.can("cast", "gust")).toBe(false);
    const r = await game.p2.try((p) => p.cast("gust", { targets: "brute" }));
    expect(r.ok).toBe(false);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
  });

  test("Gust stays illegal while Stupefy is merely ON THE CHAIN (unresolved) — Brute is still 4 Might", async () => {
    const game = await cleaveOnChain();
    await game.p2.cast("stupefy", { targets: "brute" });
    expect(game.state("brute").might).toBe(4);
    // P2 keeps priority right after adding Stupefy; Gust is still not legal.
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("Stupefy resolves: Brute drops to 3 Might, P2 draws 1, and priority reopens — Cleave's owner (P1) first, then P2 (340)", async () => {
    const game = await cleaveOnChain();
    const p2Hand = game.p2.hand().length;
    await stupefyResolves(game);
    expect(game.state("brute").might).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // Stupefy left, drew 1
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]); // one pass does not resolve Cleave
  });

  test("NOW Gust is legal on the 3-Might Brute and goes on top of Cleave; Gust resolves (Brute → P1's hand), then Cleave resolves to trash with nothing to affect", async () => {
    const game = await cleaveOnChain();
    await stupefyResolves(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["brute"]]);
    await game.p2.cast("gust", { targets: "brute" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("hand");
    expect(game.p1.hand()).toContain("brute");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle(); // both pass → Cleave resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("hand");
    expect(game.state("brute").grantedKeywords).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
