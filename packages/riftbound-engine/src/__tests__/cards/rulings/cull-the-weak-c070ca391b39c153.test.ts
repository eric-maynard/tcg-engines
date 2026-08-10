/**
 * Ruling c070ca391b39c153 — Cull the Weak (OGN-209 → ogn-209-298) · Action · Order · 2 + [order]
 *   "Each player kills one of their units."
 *   (The scrape also lists Cull, sfd-134-221 — an unrelated Equipment sharing the name; not part of the question.)
 *
 * Q: Can I play Cull the Weak to kill the opponent's unit when I have no unit in my base or at any battlefield?
 * A: Yes. It targets nothing when played, so board state doesn't matter; on resolution each player does as much as
 *    they can — with no unit you kill nothing, while the opponent must still kill one of theirs. Killing a unit is the
 *    spell's EFFECT, not an additional cost, so no sacrifice is required to play it.
 * Rules: 359.3.e.11 (do as much as you can), 355 (no target needed to finalize), 356 (costs vs effects), 422.1.a
 *        (each player chooses among the units THEY control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn with exactly [2][order] and NO units anywhere. P2: Brute (4) at P2's bf1 and Minion (1) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 1, name: "Minion" }, "minion")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling c070ca391b39c153 — Cull the Weak with no units of your own still makes the opponent kill one", () => {
  test("P1 controls no unit (base and battlefields empty of P1's units) and Cull the Weak is still a legal play: no target is asked, no sacrifice is demanded, only [2][order] is paid", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const fields = game.p1.option("cast", "cull")?.fields ?? [];
    // Nothing to target at play time: the caster's own object set is empty (no P1 unit) and P2's unit is never named by P1.
    const targets = fields.find((f) => f.name === "targets");
    expect((targets?.options ?? [[]]).every((o) => Array.isArray(o) && o.length === 0)).toBe(true);
    expect((targets?.options ?? []).flat()).not.toContain("brute");
    expect(fields.some((f) => f.arg === "sacrifice")).toBe(false); // killing is the effect, not a cost
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  });

  test("on resolution P1 (no units) kills nothing, while P2 MUST kill one of theirs — P2 chooses which (Brute at bf1 or Minion in base); the pick cannot be declined", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["brute", "minion"]);
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    await game.p2.pick("minion");
    await game.settle();
    expect(game.zoneOf("minion")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.trash()).toEqual(["cull"]); // P1 lost nothing else
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with a single P2 unit the kill is forced onto it: P1 unitless, P2's lone Brute at a battlefield dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    await game.p1.cast("cull");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("brute");
      await game.settle();
    }
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.zoneOf("cull")).toBe("trash");
  });
});
