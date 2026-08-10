/**
 * Ruling ce6e899e32d384f4 — Kraken Hunter (OGN-150 → ogn-150-298) · Unit · Body · [3][body][body] · 5 Might
 *   "[Accelerate] [Assault] As you play me, you may spend any number of buffs as an additional cost. Reduce my cost by
 *    [body] for each buff you spend."
 *
 * Q: Can Kraken Hunter spend (remove) an ENEMY unit's buff as its additional cost?
 * A: No. You can only spend buffs on units you control — even though the card doesn't say "friendly".
 * Rules: 560 / 356.2 (additional costs are paid with your own resources/objects), 702.3 (spending a buff = removing a buff
 *        from a unit YOU control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KRAKEN_HUNTER = "ogn-150-298";

/** The spend-buff choices the play menu offers for Kraken Hunter (each option is one set of buff-holders). */
function spendable(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  const f = game.p1.option("play", "kh")?.fields.find((x) => x.name === "spentBuffIds");
  return [...new Set((f?.options ?? []).flat().map(String))].sort();
}

describe("Ruling ce6e899e32d384f4 — Kraken Hunter can only spend buffs on units you control", () => {
  test("only an ENEMY unit is buffed and P1 is one [body] short (3 energy + 1 body): the Hunter is NOT playable — the enemy buff cannot cover the missing [body]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P2, "base", { might: 2, name: "Buffed Foe" }, "foe", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Plain Ally" }, "ally")
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.p1.can("play", "kh")).toBe(false);
    // forcing it with the enemy unit named as the spent buff is rejected; nothing changes
    const r = await game.p1.try((p) => p.play("kh", { costs: { paid: { "spend-buff-any": ["foe"] } }, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
  });

  test("with full money (3 + [body][body]) and only the enemy buffed: playable at full price, but the spend-buff menu never lists the enemy unit; paying full leaves the enemy buff intact", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 2 } })
      .unit(P2, "base", { might: 2, name: "Buffed Foe" }, "foe", { buffed: true })
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.p1.can("play", "kh")).toBe(true);
    expect(spendable(game)).not.toContain("foe");
    const r = await game.p1.try((p) => p.play("kh", { costs: { paid: { "spend-buff-any": ["foe"] } }, to: "base" }));
    expect(r.ok).toBe(false);
    await game.p1.play("kh", { to: "base" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("foe").isBuffed).toBe(true);
  });

  test("contrast: a buffed FRIENDLY unit can be spent — it is offered, the Hunter costs one [body] less (3 + 1 body), and the ally loses its buff", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P2, "base", { might: 2, name: "Buffed Foe" }, "foe", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Buffed Ally" }, "ally", { buffed: true })
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.p1.can("play", "kh")).toBe(true);
    expect(spendable(game)).toEqual(["ally"]); // never "foe"
    await game.p1.play("kh", { costs: { paid: { "spend-buff-any": ["ally"] } }, to: "base" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
