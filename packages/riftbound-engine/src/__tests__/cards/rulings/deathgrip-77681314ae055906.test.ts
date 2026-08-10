/**
 * Ruling 77681314ae055906 — Deathgrip (SFD-163 → sfd-163-221) · Spell · Order · 2 · [Reaction]
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · [2][order] "Each player kills one of their units." (contrast: does not target)
 *   (Cull SFD-134 is listed on the ruling but is the unrelated Equipment.)
 *
 * Q: Can I play Deathgrip with no friendly units?
 * A: No. "Kill a friendly unit" targets; a spell that requires a target can't be played without a legal one. Cull the Weak,
 *    by contrast, targets nothing and may be played even when you have no units.
 * Rules: 355.10.c (instructions naming "a friendly unit" target it), 355.8 (can't play without required legal targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const CULL_THE_WEAK = "ogn-209-298";

describe("Ruling 77681314ae055906 — Deathgrip needs a friendly unit to target; Cull the Weak does not", () => {
  test("no friendly units (the opponent has one): Deathgrip is NOT playable even with [2] + order available and P1's own turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 2, name: "Their Guy" }, "theirs")
      .hand(P1, DEATHGRIP, "grip")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "grip")).toBe(false);
    const r = await game.p1.try((p) => p.cast("grip"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("grip")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.chain()).toEqual([]);
  });

  test("control: with one friendly unit Deathgrip becomes playable, and that unit is the offered target (an enemy unit is not)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "My Guy" }, "mine")
      .unit(P2, "base", { might: 2, name: "Their Guy" }, "theirs")
      .hand(P1, DEATHGRIP, "grip")
      .build();
    expect(game.p1.can("cast", "grip")).toBe(true);
    const field = game.p1.option("cast", "grip")?.fields.find((f) => f.name === "targets" || f.arg === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["mine"]);
    await game.p1.cast("grip", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // Draw 1
  });

  test("contrast — Cull the Weak does not target: with NO friendly units P1 may still play it; only the opponent's unit dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 2, name: "Their Guy" }, "theirs")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("theirs");
      await game.settle();
    }
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
