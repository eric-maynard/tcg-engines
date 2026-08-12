/**
 * Ruling afdb4db30c4b1891 — Hostile Takeover (SFD-202 → sfd-202-221) · Spell · Mind/Order · [5][rainbow][rainbow]
 *   "[Hidden] Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and
 *    recall it at end of turn."
 *   × Vi, Hotheaded (unl-030-219) — "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *
 * Q: Does Hostile Takeover dodge [Deflect] by not choosing a target?
 * A: No — it DOES choose a target ("an enemy unit at a battlefield"), so the [Deflect] surcharge is owed.
 *    Without the extra [rainbow] the play is simply not available.
 * Rules: 355.10 (choosing an object = targeting it), 809.1.c.1 ([Deflect] surcharge charged at pick time).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const VI_HOTHEADED = "unl-030-219"; // 3 Might, [Deflect]

/** P1's turn. P2 holds bf1 with a lone [Deflect] unit. `rainbow` = how much Power P1 brought. */
function board(rainbow: number) {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VI_HOTHEADED, "vi")
    .hand(P1, HOSTILE_TAKEOVER, "takeover");
}

describe("Ruling afdb4db30c4b1891 — Hostile Takeover chooses a target, so [Deflect] must be paid", () => {
  test("the enemy unit really has [Deflect]", async () => {
    const game = await board(3).build();
    expect(game.state("vi").keywords).toContain("Deflect");
  });

  test("ruling: Hostile Takeover CHOOSES a target — the play carries a required `targets` field naming the enemy unit", async () => {
    const game = await board(3).build();
    const field = game.p1.option("cast", "takeover")?.fields?.find((f) => f.name === "targets");
    expect(field).toMatchObject({ kind: "cards", min: 1, required: true });
    expect(JSON.stringify(field?.options)).toContain("vi");
  });

  test("ruling: with only the printed [5][rainbow][rainbow] in the pool the play is NOT available — Deflect is not bypassed", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "takeover")).toBe(false);
    const r = await game.p1.try((p) => p.cast("takeover", { targets: "vi" }));
    expect(r.ok).toBe(false);
    expect(game.state("vi").controller).toBe(P2);
  });

  test("ruling: paying the extra [rainbow] makes it legal, and all three pips are consumed", async () => {
    const game = await board(3).build();
    expect(game.p1.can("cast", "takeover")).toBe(true);
    await game.p1.cast("takeover", { targets: "vi" });
    expect(game.p1.power("rainbow")).toBe(0); // 2 printed + 1 Deflect
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("vi").controller).toBe(P1);
  });

  test("contrast: against a unit WITHOUT [Deflect] the printed cost alone is enough", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Plain Guard" }, "plain")
      .hand(P1, HOSTILE_TAKEOVER, "takeover")
      .build();
    expect(game.p1.can("cast", "takeover")).toBe(true);
    await game.p1.cast("takeover", { targets: "plain" });
    expect(game.p1.power("rainbow")).toBe(0);
    await game.settle();
    expect(game.state("plain").controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
