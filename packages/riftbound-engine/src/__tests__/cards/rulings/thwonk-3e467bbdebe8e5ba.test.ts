/**
 * Ruling 3e467bbdebe8e5ba — Thwonk! (SFD-040 → sfd-040-221) · Spell · Calm · [2] · [Action] [Repeat] [2]
 *   "Stun an attacking unit. (It doesn't deal combat damage this turn.)"
 *
 * Q: When using Repeat on Thwonk, can I target a different unit than the original target?
 * A: Yes. Repeat executes the same effect again and its target is chosen independently, so the repeated execution
 *    may pick a different attacking unit (or the same one).
 * Rules: 820.2 / 820.2.a (Repeat: additional cost, effect executed again with its own choices), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THWONK = "sfd-040-221";

/** P2's turn: two 3-Might attackers swing from base into P1's bf1 held by a 2-Might Defender; P1 holds Thwonk + [4] (2 + Repeat 2). */
function siege(energy = 4) {
  return scenario()
    .active(P2)
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "atkA")
    .unit(P2, "base", { might: 3, name: "Attacker B" }, "atkB")
    .hand(P1, THWONK, "thwonk");
}

/** Both attackers move in; P2 (attacker) passes Focus → P1 holds Focus in the showdown. */
async function underAttack(energy = 4): Promise<Game> {
  const game = await siege(energy).build();
  await game.p2.move(["atkA", "atkB"], "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 3e467bbdebe8e5ba — a repeated Thwonk may stun a DIFFERENT attacking unit", () => {
  test("the repeat variant with two different targets [atkA, atkB] is a legal cast: [4] paid, ONE chain item", async () => {
    const game = await underAttack();
    await game.p1.cast("thwonk", { repeat: 1, targets: ["atkA", "atkB"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "thwonk", controller: P1 });
  });

  test("on resolution BOTH attackers are stunned; they deal no combat damage, the 2-Might Defender survives and P1 keeps bf1", async () => {
    const game = await underAttack();
    await game.p1.cast("thwonk", { repeat: 1, targets: ["atkA", "atkB"] });
    await game.settle();
    expect(game.zoneOf("thwonk")).toBe("trash");
    // Defender (2) kills neither 3-Might attacker; stunned attackers deal 0 → defenders remain → attackers recalled.
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.state("atkA")).toMatchObject({ isStunned: true, zone: "base" });
    expect(game.state("atkB")).toMatchObject({ isStunned: true, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the same unit twice is also legal (choices are independent) — then only that attacker is stunned and the other one still kills the Defender", async () => {
    const game = await underAttack();
    await game.p1.cast("thwonk", { repeat: 1, targets: ["atkA", "atkA"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("atkA").isStunned).toBe(true);
    expect(game.state("atkB").isStunned).toBe(false);
    expect(game.zoneOf("def")).toBe("trash"); // Attacker B's 3 is lethal to the 2-Might Defender
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("contrast — no Repeat ([2] only): a single Thwonk stuns one attacker; the other's damage still kills the Defender", async () => {
    const game = await underAttack(2);
    const r = await game.p1.try((p) => p.cast("thwonk", { repeat: 1, targets: ["atkA", "atkB"] }));
    expect(r.ok).toBe(false); // can't afford the Repeat
    await game.p1.cast("thwonk", { targets: "atkA" });
    await game.settle();
    expect(game.state("atkA").isStunned).toBe(true);
    expect(game.state("atkB").isStunned).toBe(false);
    expect(game.zoneOf("def")).toBe("trash");
  });
});
