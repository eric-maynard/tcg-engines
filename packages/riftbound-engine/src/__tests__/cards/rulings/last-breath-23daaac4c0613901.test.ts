/**
 * Ruling 23daaac4c0613901 — Last Breath (OGN-260 → ogn-260-298) · Action [3][rainbow][rainbow]
 *   "Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can Last Breath be used mid-showdown to respond to a Reaction-speed spell like a Hidden Blade played from facedown?
 * A: No. Last Breath is an Action; Actions can only be played while the chain is empty. Line: showdown starts, the
 *    opponent passes; you flip Hidden Blade onto their unit and pass; they may only play a Reaction or pass; on a pass
 *    Hidden Blade resolves and the unit dies; only then (chain empty) can they Last Breath with a different unit.
 *    Nuances: Last Breath may choose any friendly unit (not just Yasuo); Actions never "react".
 * Rules: 806 (Action), 811.6 (hidden → Reaction), 336/343 (Closed vs Open state), 346–347 (Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_BREATH = "ogn-260-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn (P2 = "the opponent" holding Last Breath). P1 holds bf1 with a 3-Might Defender and Hidden Blade
 * facedown there since an earlier turn. P2: vanilla Attacker A (4) and Attacker B (2) in base, Last Breath, [3] + 2 power.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 4, name: "Attacker A" }, "unitA")
    .unit(P2, "base", { might: 2, name: "Attacker B" }, "unitB")
    .hand(P2, LAST_BREATH, "lastBreath")
    .resources(P2, { energy: 3, power: { calm: 2 } });
}

/** P2 attacks bf1 with A+B (combat showdown, P2 has Focus) and passes; P1 flips Hidden Blade onto A and passes priority. */
async function bladeOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["unitA", "unitB"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  // On an EMPTY chain with Focus, the Action Last Breath would be legal for P2 right now.
  expect(game.p2.can("cast", "lastBreath")).toBe(true);
  await game.p2.passFocus(); // "Start of Showdown — opponent passes"
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade", { answers: ["unitA"] });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("unitA");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["unitA"] })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 23daaac4c0613901 — Last Breath (an Action) cannot answer a Hidden Blade on the chain; only after it resolves", () => {
  test("with Hidden Blade on the chain, P2's only options are pass/concede — Last Breath is NOT playable (Actions never react)", async () => {
    const game = await bladeOnTheChain();
    expect(game.p2.can("cast", "lastBreath")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    const r = await game.p2.try((p) => p.cast("lastBreath", { targets: ["unitB", "def"] }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("P2 passes → Hidden Blade resolves: Attacker A dies and its controller (P2) draws 2", async () => {
    const game = await bladeOnTheChain();
    const hand = game.p2.hand().length;
    await game.p2.passPriority();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("unitA")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
    expect(game.chain()).toEqual([]);
  });

  test("only now, with the chain empty and Focus back on P2, is Last Breath legal — and it may choose the vanilla Attacker B (not just Yasuo)", async () => {
    const game = await bladeOnTheChain();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "lastBreath")).toBe(true);
    const field = game.p2.option("cast", "lastBreath")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["unitB", "def"]]); // [friendly unit to ready, enemy unit at a battlefield]
    await game.p2.cast("lastBreath", { targets: ["unitB", "def"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Last Breath resolves
    expect(game.zoneOf("lastBreath")).toBe("trash");
    expect(game.state("unitB").isReady).toBe(true); // readied (it had moved in exhausted)
    expect(game.state("def").damage).toBe(2); // B's 2 Might dealt to the Defender
    expect(game.violations()).toEqual([]);
  });
});
