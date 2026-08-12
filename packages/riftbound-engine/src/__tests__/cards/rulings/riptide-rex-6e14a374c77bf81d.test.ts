/**
 * Ruling 6e14a374c77bf81d — Riptide Rex (OGN-092 → ogn-092-298) · Unit · [6][mind][mind] · 6 Might
 *     "When you play me, deal 6 to an enemy unit at a battlefield."
 *   × Shakedown (OGN-033 → ogn-033-298) · Spell · [2][fury] · Reaction — "Choose an enemy unit. Deal 6 to it
 *     unless its controller has you draw 2." (used as the opponent's answer that kills the Rex on the chain)
 *
 * Q: If Riptide Rex is killed by a spell in response to being played, does its 6-damage ability still apply?
 * A: Yes. The triggered ability is an independent object on the chain; it needs no information from the Rex
 *    itself, so it resolves and deals its 6 even though the Rex is already in the trash.
 * Rules: 383.1/383.2 (a triggered ability is its own chain object, independent of its source),
 *        359.3.e.5 (only the ability's own TARGET is re-checked at resolution), 419.4.a (playing finished when it resolved).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";
const SHAKEDOWN = "ogn-033-298";

/** P1's turn with exactly [6][mind][mind] and the Rex in hand. P2 holds bf1 with a 7-Might Bulwark and has Shakedown + [2][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Bulwark" }, "bulwark")
    .hand(P1, RIPTIDE_REX, "rex")
    .hand(P2, SHAKEDOWN, "shakedown");
}

describe("Ruling 6e14a374c77bf81d — Riptide Rex's 6 damage lands even when the Rex is killed in response", () => {
  test("premise: playing the Rex puts its ability on the chain with the Bulwark already bound as its target — the Rex itself is just a 6-Might unit in base", async () => {
    const game = await board().build();
    await game.p1.play("rex");
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rex", controller: P1, name: "Riptide Rex", targets: ["bulwark"], triggered: true }),
    ]);
    expect(game.state("bulwark").damage).toBe(0);
  });

  test("ruling: P2 Shakedowns the Rex in response (P1 as its controller is the one who chooses, and takes the 6) — the Rex dies, and the still-pending ability then resolves for its full 6 anyway", async () => {
    const game = await board().build();
    await game.p1.play("rex");
    await game.p1.passPriority();
    await game.p2.cast("shakedown", { targets: "rex" });
    await game.settle();
    // Shakedown's menu belongs to the TARGET's controller (rule 355.10.e) — P1 picks the damage.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    expect((game.decision()?.options ?? []).map((o) => o.label)).toEqual(["Have them draw 2", "Deal 6 to it"]);
    await game.p1.pick("1");
    expect(game.zoneOf("rex")).toBe("trash");
    // The Rex is dead but its ability is still on the chain, untouched.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", targets: ["bulwark"], triggered: true })]);
    await game.settle();
    expect(game.state("bulwark").damage).toBe(6);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — with no answer from P2 the Rex survives and the very same 6 is dealt: killing it changed nothing about the ability", async () => {
    const game = await board().build();
    await game.p1.play("rex");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("bulwark").damage).toBe(6);
    expect(game.zoneOf("bulwark")).toBe("battlefield-bf1"); // 6 damage on 7 Might is not lethal
  });
});
