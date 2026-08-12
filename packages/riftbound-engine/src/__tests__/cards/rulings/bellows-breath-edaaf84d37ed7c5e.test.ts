/**
 * Ruling edaaf84d37ed7c5e — Bellows Breath (SFD-080 → sfd-080-221) · [Action] [1][mind]
 *   "[Repeat] [1][mind]. Deal 1 to up to three units at the same location."
 *
 * Q: Can one instance of Bellows Breath put all 3 damage onto a single unit?
 * A: No. One execution deals 1 to each of up to three DIFFERENT units; it cannot stack its three 1s on one unit.
 *    (Paying [Repeat] buys a second execution, which may hit the same unit again — but that is a second execution,
 *    not one instance dealing 3.)
 * Rules: 355.14 (each chosen object is chosen once per instruction), 425 ([Repeat] repeats the whole effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn. Three enemy units share bf1 (the "same location"); P1 has plenty of [mind] for a Repeat. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Alpha" }, "a")
    .unit(P2, "bf1", { might: 5, name: "Beta" }, "b")
    .unit(P2, "bf1", { might: 5, name: "Gamma" }, "c")
    .hand(P1, BELLOWS_BREATH, "breath");
}

describe("Ruling edaaf84d37ed7c5e — one Bellows Breath deals 1 apiece to up to three DIFFERENT units", () => {
  test("naming the same unit three times is not a legal target set", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.cast("breath", { targets: ["a", "a", "a"] }));
    expect(r.ok).toBe(false);
    expect(game.state("a").damage).toBe(0);
    expect(game.zoneOf("breath")).toBe("hand");
  });

  test("choosing one unit deals it exactly 1 — not 3", async () => {
    const game = await board().build();
    await game.p1.cast("breath", { targets: ["a"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(0);
    expect(game.state("c").damage).toBe(0);
    expect(game.zoneOf("breath")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("choosing three units spreads 1 to each — the maximum any single unit takes from one instance is 1", async () => {
    const game = await board().build();
    await game.p1.cast("breath", { targets: ["a", "b", "c"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("[Repeat] is the only way one card puts 2+ on the same unit — and that is a SECOND execution, not one instance", async () => {
    const game = await board().build();
    await game.p1.cast("breath", { repeat: 1, targets: ["a"] });
    await game.settle();
    expect(game.state("a").damage).toBe(2); // 1 per execution
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 2 } }); // [1][mind] twice
  });
});
