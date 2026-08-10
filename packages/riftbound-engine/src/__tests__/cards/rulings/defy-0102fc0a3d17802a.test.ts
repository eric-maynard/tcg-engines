/**
 * Ruling 0102fc0a3d17802a — Defy (OGN-045 → ogn-045-298) · Reaction spell · Calm · [1]+[calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Action spell · Mind · [1]+[mind]
 *     "[Repeat] [1][mind] … Deal 1 to up to three units at the same location."
 *
 * Q: Can you Defy a Bellows Breath whose Repeat cost was paid?
 * A: Yes. Defy reads the BASE cost (1 energy / 1 power) — additional costs like Repeat don't matter.
 *    Repeat is not a second spell; it makes the one chain item execute twice. Defy goes on top (LIFO),
 *    resolves first and counters the whole spell: neither the first nor the repeated execution happens,
 *    Bellows Breath goes to trash.
 * Rules: 206 (printed cost), 746.1.d / 820 (Repeat = additional cost, same item), 412.1.a / 425.1.a
 *        (countered → no effect, to trash), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn: exactly [2] + 2 mind (base + Repeat). P2: exactly Defy's [1]+[calm]. Two P2 3-Might units at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt A" }, "u1")
    .unit(P2, "bf1", { might: 3, name: "Grunt B" }, "u2")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Bellows Breath with Repeat paid at both grunts, then passes priority to P2. */
async function castRepeatedBellows(game: Game): Promise<void> {
  await game.p1.cast("bellows", { repeat: 1, targets: ["u1", "u2"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

describe("Ruling 0102fc0a3d17802a — Defy counters a Repeat-paid Bellows Breath entirely", () => {
  test("paying Repeat drains [2] + 2 mind for ONE chain item (746.1.d — Repeat is not a second spell)", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["u1", "u2"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "bellows", controller: P1, triggered: false });
  });

  test("Defy is a legal response: the Repeat-paid Bellows Breath (base [1] + one pip) is offered as its target; Defy lands on top (206, 340.1)", async () => {
    const game = await board().build();
    await castRepeatedBellows(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "defy")).toEqual(["bellows"]);
    await game.p2.cast("defy", { targets: "bellows" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "defy"]);
  });

  test("Defy resolves first and counters the whole spell — neither the initial nor the repeated execution deals damage; both spells end in trash (412.1.a)", async () => {
    const game = await board().build();
    await castRepeatedBellows(game);
    await game.p2.cast("defy", { targets: "bellows" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves (LIFO) → Bellows Breath countered
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("bellows")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("u1").damage).toBe(0);
    expect(game.state("u2").damage).toBe(0);
    expect(game.zoneOf("u1")).toBe("battlefield-bf1");
    expect(game.zoneOf("u2")).toBe("battlefield-bf1");
    // Nothing refunded — the Repeat cost stays paid; the countered spell still counts as played.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Defied, the repeated Bellows Breath executes twice — each grunt takes 1 + 1 = 2", async () => {
    const game = await board().build();
    await castRepeatedBellows(game);
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("u1").damage).toBe(2);
    expect(game.state("u2").damage).toBe(2);
  });
});
