/**
 * Ruling 30b2fb1d5002156d — Volibear, Imposing (OGN-158 → ogn-158-298) · 10 Might
 *   "[Shield 3] [Tank] When an opponent moves to a battlefield other than mine, draw 1. (Bases are not battlefield.)"
 *
 * Q: Does Volibear draw 1 per unit that moves, or 1 per movement action? Four units moving together —
 *    one card or four?
 * A: One. The trigger reads "when an OPPONENT moves", not "when a unit moves", so one move action = one
 *    trigger no matter how many units travel in it.
 *    Nuance: Volibear has to be AT a battlefield — in base there is no "battlefield other than mine",
 *    so the ability does not trigger at all.
 * Rules: 383.1 (one trigger per inciting event), 330 (a Standard Move may move several of your units at once).
 */
import { describe, expect, test } from "bun:test";
import type { ScenarioBuilder } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_IMPOSING = "ogn-158-298";
const junk = (n: string) => ({ cardType: "unit", energyCost: 1, might: 1, name: `Card ${n}` }) as const;

/** P2's turn. P2 has four movers in base and bf2 is empty; Volibear sits where `place` puts him. */
function board(place: "bf1" | "base") {
  let b: ScenarioBuilder = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, place === "bf1" ? "bf1" : "base", VOLIBEAR_IMPOSING, "voli")
    .deck(P1, [junk("D1"), junk("D2"), junk("D3"), junk("D4")], ["d1", "d2", "d3", "d4"]);
  if (place === "base") {
    // keep bf1 occupied by SOMEONE so the two boards differ only in where Volibear is
    b = b.unit(P1, "bf1", { might: 1, name: "Holder" }, "holder");
  }
  for (let i = 1; i <= 4; i++) {
    b = b.unit(P2, "base", { might: 1, name: `Mover ${i}` }, `m${i}`);
  }
  return b;
}

describe("Ruling 30b2fb1d5002156d — Volibear draws once per movement action, not once per unit", () => {
  test("ruling: four units moving together to bf2 in one action put exactly ONE trigger on the chain", async () => {
    const game = await board("bf1").build();
    expect(game.p1.hand()).toEqual([]);
    await game.p2.move(["m1", "m2", "m3", "m4"], "bf2");
    expect(game.p2.units("bf2")).toHaveLength(4);
    expect(game.chain().filter((c) => c.cardId === "voli" && c.triggered)).toHaveLength(1);
  });

  test("ruling: P1 ends up with exactly ONE card, not four", async () => {
    const game = await board("bf1").build();
    await game.p2.move(["m1", "m2", "m3", "m4"], "bf2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: a single unit moving there also draws exactly one", async () => {
    const game = await board("bf1").build();
    await game.p2.move("m1", "bf2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  // The nuance of the ruling: "Volibear must be at a battlefield to trigger this ability. If he's in base,
  // there is no 'battlefield other than his' so the ability doesn't trigger."
  test("ruling 30b2fb1d5002156d — Volibear in BASE does not trigger at all", async () => {
    const game = await board("base").build();
    await game.p2.move(["m1", "m2", "m3", "m4"], "bf2");
    expect(game.chain().filter((c) => c.cardId === "voli" && c.triggered)).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
  });
});
