/**
 * Ruling ed89f01fbaf30136 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7]+[mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Unchecked Power (OGN-123 → ogn-123-298) · [7]+[mind][mind] "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   (+ Pouty Poro ogn-013-298 "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)")
 *
 * Q: Does the Watcher's effect trigger Deflect? Does Unchecked Power?
 * A: Neither. Both are blanket effects on all (enemy) units — they select no specific object, so nothing is "chosen"
 *    and no Deflect payment is owed; the Deflect unit is affected like everyone else.
 * Rules: 809 (Deflect taxes CHOOSING), 355.5 vs 355.10 (targeted vs untargeted "all" effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const UNCHECKED_POWER = "ogn-123-298";
const POUTY_PORO = "ogn-013-298"; // 2 Might, [Deflect]

describe("Ruling ed89f01fbaf30136 — blanket effects (Thousand-Tailed Watcher, Unchecked Power) don't choose, so Deflect never applies", () => {
  test("Thousand-Tailed Watcher played with EXACTLY [7]+[mind] (nothing spare for a Deflect tax): no target prompt, and every enemy unit — the Deflect Poro included — gets -3 (min 1); friendly units untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, WATCHER, "watcher")
      .script(P1, [], { strict: true }) // any "choose"/pay prompt for P1 would throw
      .build();
    expect(game.state("poro").keywords).toContain("Deflect");
    await game.p1.play("watcher");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // nothing chosen
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ might: 1 }); // 2 − 3 → floor 1, Deflect notwithstanding
    expect(game.state("brute").might).toBe(2);
    expect(game.state("home").might).toBe(3);
    expect(game.state("ally").might).toBe(3);
    expect(game.state("watcher").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // no Deflect payment was ever taken
    expect(game.violations()).toEqual([]);
  });

  test("Unchecked Power cast with EXACTLY [7]+[mind][mind]: no targets on the cast, friendly units are exhausted, then 12 hits ALL units at battlefields — the Deflect Poro dies with the rest; units in bases are not 'at battlefields'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
      .unit(P1, "bf2", { might: 3, name: "Mine" }, "mine")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, UNCHECKED_POWER, "up")
      .script(P1, [], { strict: true })
      .build();
    expect(game.p1.option("cast", "up")?.fields.map((f) => f.arg) ?? []).not.toContain("targets");
    await game.p1.cast("up");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.settle();
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash"); // Deflect did not shield it and nothing was paid
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash"); // ALL units at battlefields, friendly too
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isExhausted).toBe(true); // "Exhaust all friendly units" happened first
    expect(game.violations()).toEqual([]);
  });
});
