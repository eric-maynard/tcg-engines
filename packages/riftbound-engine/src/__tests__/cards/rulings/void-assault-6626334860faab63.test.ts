/**
 * Ruling 6626334860faab63 — Void Assault (UNL-202 → unl-202-219) · Body/Chaos spell · [2][rainbow]
 *     "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't control, you're the attacker.)"
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (× Star-Crossed unl-128-219 cited as the "do as much as you can" precedent.)
 *
 * Q: I play Void Assault; the opponent Gusts their own unit in response. Does my unit still move?
 * A: Yes. Gust resolves first (enemy unit → hand). Void Assault then does as much as it can: instruction 1 (move my unit)
 *    resolves normally; instruction 2 (move the enemy unit) is ignored — its object left the board. The two are not linked.
 * Rules: 340 (LIFO), 359.3.e.5/.e.6 (illegal target unaffected; instructions that can't be followed are ignored),
 *        359.3.e.14 (unlinked instructions resolve independently).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const GUST = "ogn-169-298";

/**
 * P1's turn with exactly [2][rainbow]. P1's 4-Might Scout in base; P2's 2-Might Minion holds bf2; bf1 is empty/uncontrolled.
 * P2: Gust + exactly [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 2, name: "Minion" }, "minion")
    .hand(P1, VOID_ASSAULT, "va")
    .hand(P2, GUST, "gust");
}

/** P1 casts Void Assault [Scout, Minion], sending both to bf1 (answering the destination prompts); passes; P2 Gusts the Minion. */
async function assaultThenGust(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("va", { targets: ["scout", "minion"] });
  for (let i = 0; i < 3; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    expect(d.semantics).toBe("destination");
    const bf1 = d.options.find((o) => o.key === "battlefield-bf1");
    expect(bf1).toBeDefined();
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "va", controller: P1, targets: ["scout", "minion"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "minion" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["va", "gust"]);
  return game;
}

describe("Ruling 6626334860faab63 — Void Assault still moves my unit after Gust bounced the enemy one", () => {
  test("Gust resolves first (LIFO): the Minion is back in P2's hand; Void Assault still pending, Scout still in base", async () => {
    const game = await assaultThenGust();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("minion")).toBe("hand");
    expect(game.p2.hand()).toContain("minion");
    expect(game.chain().map((c) => c.cardId)).toEqual(["va"]);
    expect(game.locationOf("scout")).toBe("base");
  });

  test("ruling: Void Assault resolves as far as it can — the Scout MOVES to bf1 (ready; instruction 1), the Minion instruction is ignored (it stays in hand), the spell goes to trash resolved", async () => {
    const game = await assaultThenGust();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.state("scout")).toMatchObject({ controller: P1, isReady: true });
    expect(game.zoneOf("minion")).toBe("hand");
    expect(game.cardsAt("battlefield-bf1").toSorted()).toEqual(["scout"]);
  });

  test("aftermath: the Scout takes the empty bf1 (P1 conquers, 1 point) — nothing was 'cancelled' by the failed half", async () => {
    const game = await assaultThenGust();
    await game.settle();
    if (game.decision()?.kind === "action" && (game.decision() as { context?: string }).context !== "main") {
      await game.settle();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("minion")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — no Gust: both halves resolve; Scout and Minion both end up at bf1 and a combat opens with P1 attacking", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["scout", "minion"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("battlefield-bf1");
    }
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.locationOf("minion")).toBe("bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1" });
  });
});
