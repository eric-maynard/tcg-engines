/**
 * Ruling 5094aa8706694882 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 Might
 *   "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Draven, Audacious (sfd-148-221) — a 6-Might unit with [Deflect].
 *
 * Q: Does the Watcher's ability make me pay Deflect's surcharge for an enemy unit with [Deflect]?
 * A: No. The ability affects "enemy units" as a criterion — it never CHOOSES one — and [Deflect] only
 *    taxes choosing. No extra Power is paid and the Deflect unit still gets -3 Might.
 * Rules: 809.1.c (Deflect taxes an opponent CHOOSING the unit), 355.10 (criteria are not choices).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const DRAVEN_AUDACIOUS = "sfd-148-221"; // 6 Might, [Deflect]
const STUPEFY = "ogn-095-298"; // [Reaction] Give a unit -1 Might this turn (min 1). Draw 1.

describe("Ruling 5094aa8706694882 — Thousand-Tailed Watcher's blanket -3 ignores [Deflect]", () => {
  test("the Watcher is played for exactly its printed cost — no Deflect surcharge — and the Deflect unit drops 6 → 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } }) // EXACTLY the printed cost: no spare Power for a Deflect tax
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DRAVEN_AUDACIOUS, "draven")
      .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
      .hand(P1, WATCHER, "watcher")
      .build();

    expect(game.state("draven").keywords).toContain("Deflect");
    expect(game.state("draven").might).toBe(6);

    // The play offers no `targets` field at all: the trigger names a criterion, not a choice.
    const option = game.p1.option("play", "watcher");
    expect(option?.fields.some((f) => f.name === "targets")).toBe(false);

    await game.p1.play("watcher", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();

    expect(game.state("draven").might).toBe(3); // 6 - 3, no surcharge asked or paid
    expect(game.state("home").might).toBe(1); // 4 - 3
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an effect that DOES choose that same unit is taxed: Stupefy needs a Power surcharge to name Draven", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 }) // Stupefy's own cost, but nothing to pay Deflect with
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DRAVEN_AUDACIOUS, "draven")
      .unit(P2, "bf1", { might: 4, name: "Plain" }, "plain")
      .hand(P1, STUPEFY, "stupefy")
      .build();

    const targets = game.p1.option("cast", "stupefy")?.fields.find((f) => f.name === "targets");
    // The un-Deflected unit is choosable; Draven is not, because the surcharge is unpayable.
    expect(targets?.options).toEqual([["plain"]]);

    const blocked = await game.p1.try((p) => p.cast("stupefy", { targets: "draven" }));
    expect(blocked.ok).toBe(false);
  });
});
