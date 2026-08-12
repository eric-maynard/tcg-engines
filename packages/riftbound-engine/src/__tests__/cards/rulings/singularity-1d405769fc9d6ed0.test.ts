/**
 * Ruling 1d405769fc9d6ed0 — Singularity (OGN-105 → ogn-105-298) · [6][mind][mind] spell
 *   "Deal 6 to each of up to two units."
 *
 * Q: Does Singularity have to pick two DIFFERENT units, or can it pick the same one twice?
 * A: Two different units — each chosen unit takes 6 (it is not 6 split between them). The same object
 *    can never fill two slots of one "up to two units" choice. With only one legal unit around the spell
 *    is still castable, because the count is "up to two".
 * Rules: 355.12–355.14 (a set of chosen objects is distinct), 355.9 (choosing rules), quantity {upTo:2}.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";

/** P1's turn with exactly [6][mind][mind]. `enemies` 8-Might units survive a 6 so damage is observable. */
function board(enemies: number) {
  let b = scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .hand(P1, SINGULARITY, "sing");
  for (let i = 0; i < enemies; i++) {
    b = b.unit(P2, "base", { might: 8, name: `Foe ${i + 1}` }, `foe${i + 1}`);
  }
  return b;
}

describe("Ruling 1d405769fc9d6ed0 — Singularity chooses two DIFFERENT units and deals 6 to EACH", () => {
  test("both chosen units take a full 6 — the damage is not split between them", async () => {
    const game = await board(2).build();
    await game.p1.cast("sing", { targets: ["foe1", "foe2"] });
    await game.settle();
    expect(game.state("foe1").damage).toBe(6);
    expect(game.state("foe2").damage).toBe(6);
    expect(game.zoneOf("foe1")).toBe("base");
    expect(game.zoneOf("foe2")).toBe("base");
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("naming the SAME unit for both slots is rejected — the two targets must be distinct", async () => {
    const game = await board(2).build();
    const r = await game.p1.try((p) => p.cast("sing", { targets: ["foe1", "foe1"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sing")).toBe("hand");
    expect(game.state("foe1").damage).toBe(0);
  });

  test("the offered sets never pair a unit with itself", async () => {
    const game = await board(2).build();
    const fields = game.p1.option("cast", "sing")?.fields ?? {};
    const sets = Object.values(fields)
      .flatMap((f) => (f as { options?: unknown[] }).options ?? [])
      .map((o) => String(o));
    for (const s of sets) {
      expect(s).not.toBe("foe1,foe1");
      expect(s).not.toBe("foe2,foe2");
    }
  });

  test("nuance: with only ONE unit on the board Singularity is still castable — it says 'up to two'", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "sing")).toBe(true);
    await game.p1.cast("sing", { targets: ["foe1"] });
    await game.settle();
    expect(game.state("foe1").damage).toBe(6);
    expect(game.zoneOf("sing")).toBe("trash");
  });
});
