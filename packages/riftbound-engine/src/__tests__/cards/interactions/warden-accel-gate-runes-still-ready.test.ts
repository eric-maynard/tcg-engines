/**
 * Interaction: Mageseeker Warden (ogn-070-298) × Acceleration Gate (ven-150-166)
 *
 *   Mageseeker Warden — Unit · Calm · 6 + [calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base.
 *      While I'm at a battlefield, spells and abilities can't ready enemy units and gear."
 *   Acceleration Gate — Spell · Mind/Body · 3 energy + [rainbow]
 *     "Ready up to 4 units, gear, and/or runes."
 *
 * Question: P1's turn. P2's Warden is at bf1. P1 has an exhausted unit U and gear G in base,
 * three exhausted runes r1–r3, exactly the Gate's cost (3 energy + 1 power) and a pip-less
 * 2-cost unit in hand. P1 casts the Gate choosing U, G, r1, r2.
 *  (a) which of the four become ready?  (b) can P1 then tap r1+r2 and play the 2-drop?
 *  (c) control: Warden in P2's base.     (d) may the Gate pick an ENEMY rune, and can P1 use it?
 *
 * Expected (rules): the Warden's static forbids spells/abilities readying enemy UNITS AND GEAR
 * only. Runes are their own card type — not units, not gear, not Main-Deck permanents (161.1.a,
 * 133.5.a.1) — so r1/r2 ready while U/G stay exhausted; the impossible instructions are simply
 * skipped (359.3.e.6) and the spell still resolves. Ready runes have "[E]: Add [1]" again
 * (164.2.a, 429.2) so P1 refunds 2 energy and the 2-drop becomes playable. With the Warden in
 * base the "While I'm at a battlefield" conditional passive (364) is off and all four ready.
 * The Gate has no "friendly" qualifier so an enemy rune is a legal choice and is readied, but a
 * rune's [E]/Recycle abilities belong to its controller (164.2, 166.1): P1 can never tap it.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WARDEN = "ogn-070-298";
const GATE = "ven-150-166";
const EXHAUSTED = { exhausted: true } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of the cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn; P2's Warden at `wardenAt`; P1 has exhausted U, G, r1–r3, exactly 3+[rainbow], and a 2-drop. */
function board(wardenAt: "bf1" | "base" = "bf1") {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, wardenAt, WARDEN, "warden")
    .unit(P1, "base", { might: 2, name: "Tired Grunt" }, "U", EXHAUSTED)
    .gear(P1, { cardType: "gear", name: "Trinket" }, "G", EXHAUSTED)
    .rune(P1, "mind", { alias: "r1", exhausted: true })
    .rune(P1, "mind", { alias: "r2", exhausted: true })
    .rune(P1, "body", { alias: "r3", exhausted: true })
    .rune(P2, "calm", { alias: "theirRune", exhausted: true })
    .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Two Drop" }, "twoDrop")
    .hand(P1, GATE, "gate");
}

describe("Mageseeker Warden × Acceleration Gate — runes are neither units nor gear", () => {
  test("setup: the Gate is castable for exactly 3+[rainbow]; the 2-drop is NOT castable alongside it (pool is exactly the Gate's cost, all runes exhausted)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "gate")).toBe(true);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.can("tapRune")).toBe(false);
    // all four chosen objects are legal choices for the Gate
    const offered = targetsOffered(game, "gate");
    for (const id of ["U", "G", "r1", "r2", "r3"]) {
      expect(offered).toContain(id);
    }
    await game.p1.cast("gate", { targets: ["U", "G", "r1", "r2"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // with the pool drained the 2-drop is no longer playable
    expect(game.p1.can("play", "twoDrop")).toBe(false);
  });

  test("(a) Warden at bf1: r1 and r2 become READY — runes are not 'units and gear' (161.1.a, 133.5.a.1)", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: ["U", "G", "r1", "r2"] });
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.state("r1").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    expect(game.state("r3").isReady).toBe(false); // not chosen
  });

  test("(a) Warden at bf1: U and G stay EXHAUSTED — the enemy spell can't ready them; the rest of the spell still resolves (359.3.e.6)", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: ["U", "G", "r1", "r2"] });
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.state("G").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("(b) after resolution P1 taps r1 and r2 for +2 energy (164.2.a, 429.2) and the 2-drop is then enumerated and playable", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: ["U", "G", "r1", "r2"] });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "twoDrop")).toBe(false);
    expect(new Set(game.p1.runes({ ready: true }))).toEqual(new Set(["r1", "r2"]));
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    await game.p1.tapRune("r2");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "twoDrop")).toBe(true);
    await game.p1.play("twoDrop", { to: "base" });
    await game.settle();
    expect(game.zoneOf("twoDrop")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) control — Warden in P2's BASE: its 'While I'm at a battlefield' static is off (364); U, G, r1 and r2 all become ready", async () => {
    const game = await board("base").build();
    await game.p1.cast("gate", { targets: ["U", "G", "r1", "r2"] });
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.state("U").isReady).toBe(true);
    expect(game.state("G").isReady).toBe(true);
    expect(game.state("r1").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    expect(game.state("r3").isReady).toBe(false);
  });

  test("(d) the Gate has no 'friendly' qualifier: P2's exhausted rune is offered and, if chosen, is readied even under the Warden ('enemy' is relative to the Warden)", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "gate")).toContain("theirRune");
    await game.p1.cast("gate", { targets: ["theirRune", "r1", "r2"] });
    await game.settle();
    expect(game.state("theirRune").isReady).toBe(true);
    expect(game.state("r1").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
  });

  test("(d) …but a rune's [E]/Recycle abilities belong to its controller (164.2, 166.1): P1 can never tap or recycle P2's readied rune; only P2 can, later", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: ["theirRune", "r1", "r2"] });
    await game.settle();
    expect(game.state("theirRune").isReady).toBe(true);
    // P1's tap/recycle menu lists only P1's own runes
    const p1RuneOptions = game.p1
      .legal()
      .filter((o) => o.moveId === "exhaustRune" || o.moveId === "recycleRune")
      .map((o) => o.card);
    expect(p1RuneOptions).not.toContain("theirRune");
    expect(game.p1.can("tapRune", "theirRune")).toBe(false);
    expect(game.p1.can("recycleRune", "theirRune")).toBe(false);
    await expect(game.p1.tapRune("theirRune")).rejects.toThrow();
    await expect(game.p1.recycleRune("theirRune")).rejects.toThrow();
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    // On P2's turn the rune is P2's to tap.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const before = game.p2.energy();
    await game.p2.tapRune("theirRune");
    expect(game.p2.energy()).toBe(before + 1);
  });
});
