/**
 * Ruling 7a8e0f0c6fce3a93 — Alpha Strike (UNL-192 → unl-192-219) · Action · 3+[rainbow] "Choose a friendly unit. It deals damage equal
 *     to its Might split among enemy units at battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *
 * Q: Does Stun reduce Alpha Strike's damage to 0?
 * A: No. Stun only stops a unit contributing its Might to COMBAT damage (423.1.b). Damage a unit is directed to deal by a card
 *    effect (Alpha Strike, Challenge, …) is unaffected: the stunned unit deals its full Might.
 * Rules: 423.1.b (Stunned: no combat damage), 437 (damage from effects), Alpha Strike text.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";

/** P1's turn. P1's STUNNED Striker (5) in base; P2 holds bf1 with a lone Target (5). P1 has exactly 3 + [rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker", { stunned: true })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .hand(P1, ALPHA_STRIKE, "alpha");
}

describe("Ruling 7a8e0f0c6fce3a93 — a Stunned unit still deals its full Might through Alpha Strike", () => {
  test("premise: the Striker is Stunned and still 5 Might; Alpha Strike may choose it as the friendly unit", async () => {
    const game = await board().build();
    expect(game.state("striker")).toMatchObject({ isStunned: true, might: 5 });
    expect(game.p1.can("cast", "alpha")).toBe(true);
    const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
    const flat = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(flat).toContain("striker");
  });

  test("Alpha Strike with the stunned Striker: the Target takes the FULL 5 (not 0) and dies; P1 gains 1 XP for the kill", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["striker", "target"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    for (let i = 0; i < 8; i++) {
      const stop = await game.settle();
      const d = game.decision();
      if (stop.reason !== "unanswered" || d?.kind !== "distribute") {
        break;
      }
      expect(d.seat).toBe(P1);
      const bucket = d.buckets.find((b) => (b.card ?? b.key) === "target") ?? d.buckets[0]!;
      await game.p1.distribute({ [bucket.key]: d.total });
    }
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("target")).toBe("trash"); // 5 damage ≥ 5 Might
    expect(game.p2.trash()).toContain("target");
    expect(game.p1.xp()).toBe(1);
    expect(game.state("striker")).toMatchObject({ damage: 0, isStunned: true, zone: "base" }); // Alpha Strike is one-way
    expect(game.violations()).toEqual([]);
  });

  test("contrast — what Stun DOES do: in combat the same stunned 5-Might unit contributes no damage (the 1-Might blocker survives untouched) while still taking damage itself", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Striker" }, "striker", { stunned: true })
      .unit(P2, "bf1", { might: 1, name: "Blocker" }, "blocker")
      .build();
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("battlefield-bf1");
    expect(game.state("blocker").damage).toBe(0); // stunned attacker dealt nothing
    expect(game.zoneOf("striker")).toBe("base"); // survived 1 damage, recalled (defender remains), healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
