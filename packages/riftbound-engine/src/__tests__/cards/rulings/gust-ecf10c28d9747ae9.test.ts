/**
 * Ruling ecf10c28d9747ae9 — Gust (OGN-169 → ogn-169-298) · [1] · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Stupefy (OGN-095 → ogn-095-298) · [1] · [Reaction] "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Can I Gust a 4-Might unit and then react with Stupefy to bring it to 3 before Gust resolves?
 * A: No. "3 Might or less" is part of Gust's targeting requirement, checked when Gust is played — a 4-Might unit is not a
 *    legal target at all. Play Stupefy FIRST (unit → 3), then Gust can target it.
 * Rules: 355.5–355.8 (targeting requirements must be met at play), 359.3.e.5 (rechecked at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const STUPEFY = "ogn-095-298";

/** P1's turn with [2], Gust + Stupefy in hand. P2 holds bf1 with a 4-Might Brute and a 2-Might Runt. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .hand(P1, GUST, "gust")
    .hand(P1, STUPEFY, "stupefy");
}

const gustTargets = (game: Game) =>
  (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets" || f.arg === "targets")?.options ?? []).flat() as string[];

describe("Ruling ecf10c28d9747ae9 — Gust's '3 Might or less' is a targeting requirement: Stupefy must come first", () => {
  test("a 4-Might unit is simply not a legal Gust target: only the Runt is offered, and forcing the Brute is rejected (nothing goes on the chain, nothing is paid)", async () => {
    const game = await board().build();
    expect(gustTargets(game)).toEqual(["runt"]);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "brute" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("so 'Gust first, then Stupefy in response' is impossible — with Gust legally cast (at the Runt), Stupefy on the Brute afterwards changes nothing for Gust: the Runt is bounced, the Brute (now 3) stays", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "runt" });
    await game.p1.cast("stupefy", { targets: "brute" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "stupefy"]);
    await game.settle();
    expect(game.state("brute").might).toBe(3);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("runt")).toBe("hand");
  });

  test("the legal sequence: Stupefy FIRST (Brute 4 → 3, draw 1) — once it has resolved the Brute IS a legal Gust target and Gust returns it to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "brute" });
    // While Stupefy is still on the chain the Brute is still 4 — Gust still can't take it.
    expect(gustTargets(game)).not.toContain("brute");
    await game.settle();
    expect(game.state("brute").might).toBe(3);
    expect(gustTargets(game).sort()).toEqual(["brute", "runt"]);
    await game.p1.cast("gust", { targets: "brute" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("hand");
    expect(game.p2.hand()).toContain("brute");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
