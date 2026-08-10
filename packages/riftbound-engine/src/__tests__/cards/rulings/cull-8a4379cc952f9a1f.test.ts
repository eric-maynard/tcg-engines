/**
 * Ruling 8a4379cc952f9a1f — "Cull of the Weak" (scrape lists Cull SFD-134; the question is about Cull the Weak,
 *   OGN-209 → ogn-209-298 · 2 + [order] · "Each player kills one of their units.")
 *   × Herald of the Arcane (Viktor legend, ogn-265-298) "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   × Cruel Patron (OGN-208 → ogn-208-298) "As an additional cost to play me, kill a friendly unit."
 *   × Harnessed Dragon (OGN-234) / Hidden Blade (OGN-213 → ogn-213-298) — targeted kills, for contrast.
 *
 * Q: Can Cull the Weak be cast with no units of your own, and can you then make a token (Viktor) without having
 *    had to sacrifice anything?
 * A: Yes. Cull the Weak does not target — each player chooses on resolution — so it is castable with an empty
 *    board; you do as much as you can (kill nothing) while the opponent still kills one. A token made afterwards
 *    is safe. Contrast: Cruel Patron's kill is an additional COST (needs a unit to play it); Hidden Blade /
 *    Harnessed Dragon TARGET and need a legal target.
 * Rules: 355 (targets vs resolution choices), 359.3.e.11 (do as much as you can), 356 (additional costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const HERALD_OF_THE_ARCANE = "ogn-265-298";
const CRUEL_PATRON = "ogn-208-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn: NO units, Viktor legend ready, 2 + [order] for Cull + [1] for the legend. P2 has two units. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 1 } })
    .legend(P1, HERALD_OF_THE_ARCANE, "viktor")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Small" }, "small")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 8a4379cc952f9a1f — Cull the Weak with no friendly units; a token made afterwards is never owed", () => {
  test("P1 controls no units yet Cull the Weak is castable and goes on the chain with nothing chosen (it does not target)", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("small")).toBe("base");
  });

  test("on resolution P1 kills nothing (do as much as you can) while P2 — choosing at resolution — must kill one of theirs", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
    await game.p2.pick("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling 8a4379cc952f9a1f — afterwards P1 makes a Recruit token with Viktor's legend: it stays on the board — nothing was owed from the earlier Cull", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("small");
      await game.settle();
    }
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.can("activate", "viktor")).toBe(true);
    await game.p1.activate("viktor");
    await game.settle();
    const tokens = game.p1.units("base").filter((u) => game.state(u).isToken);
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string)).toMatchObject({ might: 1, name: "Recruit", zone: "base" });
    expect(game.state("viktor").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Cruel Patron: killing a friendly unit is an additional COST, so with no units it cannot be played even fully funded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P2, "base", { might: 1, name: "Small" }, "small")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("play", "patron")).toBe(false);
    // …and with a unit to kill it becomes playable.
    const withPawn = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(withPawn.p1.can("play", "patron")).toBe(true);
    await withPawn.p1.play("patron", { sacrifice: "pawn" });
    await withPawn.settle();
    expect(withPawn.zoneOf("pawn")).toBe("trash");
    expect(withPawn.zoneOf("patron")).toBe("base");
  });

  test("contrast — Hidden Blade TARGETS 'a unit at a battlefield': with no unit at any battlefield it cannot be cast", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 1, name: "Small" }, "small") // in a base, not at a battlefield
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    expect(game.p1.can("cast", "blade")).toBe(false);
  });
});
