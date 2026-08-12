/**
 * Ruling 30bfa1a781e5725a — Falling Star (OGN-029 → ogn-029-298) · Fury · [2][fury][fury]
 *   "Deal 3 to a unit. Deal 3 to a unit."
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024) · Master Yi's legend
 *     "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: Why does Falling Star kill my Poro at a battlefield when my legend should be making it bigger?
 * A: Because the Poro is not DEFENDING. Attacker/defender designations exist only once a combat showdown has
 *    started, and a showdown cannot start while anything is on the chain — Falling Star is on the chain when it
 *    resolves, so the Poro is still an ordinary unit at its printed Might and takes the 3.
 * Rules: 459.2.b (designations are applied when the showdown starts), 310 (a showdown starts from an Open State
 *        with an empty chain), 364.3 (the legend's bonus is conditioned on the unit's combat state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const WUJU_BLADESMAN = "ogs-019-024";
const HEXTECH_RAY = "ogn-009-298"; // [Action] [1][fury] "Deal 3 to a unit at a battlefield."

/** P1's turn with the full [2][fury][fury]. P2 has the Bladesman legend and a lone 2-Might Poro at their bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .legend(P2, WUJU_BLADESMAN, "bladesman")
    .unit(P2, "bf2", { might: 2, name: "Poro" }, "poro")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P1, FALLING_STAR, "star");
}

/** P1 casts Falling Star, both bolts on the Poro's battlefield: one at the Poro, one at P1's own Brute. */
async function cast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("star", { targets: ["poro", "brute"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
  return game;
}

describe("Ruling 30bfa1a781e5725a — no showdown means no Defender, so the legend's defending-alone bonus never applies", () => {
  test("with no combat the Poro has no combat role and sits at its printed 2 Might, legend or no legend", async () => {
    const game = await board().build();
    expect(game.p2.legend()).toBe("bladesman");
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.state("poro").might).toBe(2);
  });

  test("while Falling Star is on the chain P2 cannot move a unit in to start a showdown — no move is even offered", async () => {
    const game = await cast();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().every((o) => o.verb !== "move" && o.verb !== "gank")).toBe(true);
  });

  test("ruling: Falling Star resolves with the Poro still un-designated — 3 damage on a 2-Might unit kills it", async () => {
    const game = await cast();
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("brute").damage).toBe(3); // the other bolt, on a 6-Might unit
    expect(game.violations()).toEqual([]);
  });

  test("contrast: in a REAL combat the Poro defends alone, gets the legend's +2 to 4 Might, and survives 3 damage", async () => {
    const game = await board()
      .resources(P1, { energy: 3, power: { fury: 3 } })
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.move("brute", "bf2"); // a genuine attack — the showdown starts, designations are applied
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.p1.cast("ray", { targets: "poro" }); // an Action-speed 3, the same amount Falling Star deals
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("poro").damage).toBe(3);
    expect(game.zoneOf("poro")).toBe("battlefield-bf2"); // 3 < 4 — it lives, exactly as the asker expected
    expect(game.violations()).toEqual([]);
  });
});
