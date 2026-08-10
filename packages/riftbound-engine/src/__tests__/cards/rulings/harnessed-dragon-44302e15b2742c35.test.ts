/**
 * Ruling 44302e15b2742c35 — Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · Order · [8][order][order] · 6 Might
 *     "When you play me, kill an enemy unit."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: "Harnessed Dragon can't be countered with Not So Fast" — true?
 * A: False. The Dragon's "When you play me" is a triggered ability that goes on the chain and CHOOSES an enemy
 *    unit (a friendly unit of the NSF player), so Not So Fast may target and counter it. LIFO: NSF resolves
 *    first, the trigger is countered and never executes — the unit is not killed. The Dragon itself stays.
 * Rules: 383 (triggered abilities use the chain), 425.1 / 425.1.a (countered item does nothing), FAQ #11198/#9377.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const NOT_SO_FAST = "sfd-045-221";

/** P2's turn: Dragon in hand with exactly [8][order][order]. P1: Victim (3) at P1's bf1, NSF in hand with [2][calm]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .hand(P1, NOT_SO_FAST, "nsf")
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .hand(P2, HARNESSED_DRAGON, "dragon")
    .resources(P2, { energy: 8, power: { order: 2 } });
}

/** P2 plays the Dragon naming Victim; returns with the trigger on the chain and P1 holding priority. */
async function dragonTargetsVictim(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P2) {
      const opt = d.options.find((o) => (o.card ?? o.key) === "victim");
      expect(opt).toBeDefined();
      await game.p2.answer({ keys: [opt!.key], kind: "pick" });
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && d.seat === P2 && d.passKey) {
      await game.p2.passPriority();
      continue;
    }
    break;
  }
  // Step 1–3 of the ruling: unit on the board, trigger on the chain choosing Victim, state CLOSED with P1 to act.
  expect(game.zoneOf("dragon")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, triggered: true, type: "ability" })]);
  expect(game.chain()[0]?.targets ?? []).toEqual(["victim"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 44302e15b2742c35 — Not So Fast CAN counter Harnessed Dragon's 'kill an enemy unit' trigger", () => {
  test("step 4: with the trigger on the chain, Not So Fast is legal and its offered objects include the Dragon's ability", async () => {
    const game = await dragonTargetsVictim();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("dragon");
    await game.p1.cast("nsf", { targets: "dragon" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "nsf"]);
  });

  test("step 5: LIFO — NSF resolves first and counters the ability; it leaves the chain without executing: Victim survives, the Dragon unit remains in play", async () => {
    const game = await dragonTargetsVictim();
    await game.p1.cast("nsf", { targets: "dragon" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("dragon")).toBe("base"); // countering the ability does not undo the unit
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger kills Victim", async () => {
    const game = await dragonTargetsVictim();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("base");
  });
});
