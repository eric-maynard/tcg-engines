/**
 * Ruling cc37c0ea29228ccc — Bellows Breath (SFD-080 → sfd-080-221) · Action [1][mind] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 "If I would die, kill Guardian Angel instead. Heal me, exhaust me,
 *     and recall me." (cited for the "saves only apply at cleanup" nuance)
 *
 * Q: Can Bellows Breath with Repeat target the SAME 1-Might unit twice?
 * A: Yes. One execution can't name a unit twice, but the repeated execution may name the same unit again. It takes 1, then 1;
 *    lethal damage is only checked in the Cleanup after the whole spell resolves — the unit dies then (2 ≥ 1). Death
 *    replacements / heals likewise only step in at that cleanup, after both hits have landed.
 * Rules: 820 (Repeat = a further execution with its own choices), 520 (lethal damage checked at cleanup), 373.2 (GA).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const GUARDIAN_ANGEL = "sfd-051-221";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
    .unit(P2, "bf1", { might: 3, name: "Bystander" }, "bystander")
    .hand(P1, BELLOWS_BREATH, "bellows");
}

describe("Ruling cc37c0ea29228ccc — Bellows Breath's repeated execution may hit the same 1-Might unit again", () => {
  test("legal: the cast offers [weak, weak] as the two executions' targets; casting it with Repeat pays [2] + 2 mind and locks both on the chain", async () => {
    const game = await board().build();
    const pairs = game.p1.option("cast", "bellows")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["weak", "weak"]);
    await game.p1.cast("bellows", { repeat: 1, targets: ["weak", "weak"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", controller: P1, targets: ["weak", "weak"] })]);
    // Nothing has died yet — the spell has not resolved.
    expect(game.zoneOf("weak")).toBe("battlefield-bf1");
    expect(game.state("weak").damage).toBe(0);
  });

  test("resolution: 1 + 1 damage marked, then the post-resolution cleanup kills the 1-Might unit; the untargeted Bystander is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["weak", "weak"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.state("bystander")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("a single execution cannot name the same unit twice (no [weak, weak] inside ONE 'up to three' group without Repeat)", async () => {
    const game = await board().build();
    const variants = game.p1.option("cast", "bellows")?.variants ?? [];
    const doubleWeak = variants.filter((v) => JSON.stringify(v.params.targets) === JSON.stringify(["weak", "weak"]));
    expect(doubleWeak.length).toBeGreaterThan(0);
    // Every legal way to name Weakling twice is the Repeat line (two executions), never one execution's target group.
    expect(doubleWeak.every((v) => v.params.repeatCount === 1)).toBe(true);
    // Whereas two DIFFERENT units at the same location fit in a single execution (no Repeat needed).
    expect(variants.some((v) => JSON.stringify(v.params.targets) === JSON.stringify(["weak", "bystander"]) && !v.params.repeatCount)).toBe(true);
  });

  test("nuance: with Guardian Angel (+1 → 2 Might) both hits land first; only the cleanup's would-die check fires GA — GA is killed instead, the unit is healed, exhausted and recalled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Ward" }, "ward", { equippedWith: ["ga"] } as Record<string, unknown>)
      .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "ward" } as Record<string, unknown>, owner: P2, zone: "battlefield-bf1" })
      .unit(P2, "bf1", { might: 3, name: "Anchor" }, "anchor")
      .hand(P1, BELLOWS_BREATH, "bellows")
      .build();
    expect(game.state("ward").might).toBe(2);
    await game.p1.cast("bellows", { repeat: 1, targets: ["ward", "ward"] });
    await game.settle();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options[0]!.key);
        await game.settle();
      } else {
        break;
      }
    }
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });
});
