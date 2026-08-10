/**
 * Ruling 7e17d2adb7eef268 — Navori Fighting Pit (OGN-283 → ogn-283-298) · Battlefield
 *     "When you hold here, buff a unit here. (If it doesn't have a buff, it gets a +1 [Might] buff.)"
 *   × Stupefy (ogn-095-298) · Reaction · [1] mind — the opponent's response.
 *
 * Q: Can I react to the Fighting Pit's hold trigger even if the units there are already buffed?
 * A: Yes. The trigger condition (you held) is met, so the ability goes on the chain — a Closed state in which Reactions may
 *    be played — regardless of the units already having buffs. But: a buffed unit gains no second buff, and the trigger's
 *    target is locked at finalization (before anyone can react), so a reaction cannot redirect the buff.
 * Rules: 383.3 (triggered ability → chain), 309.1.a (Closed state ⇒ Reactions), 355.5–355.7 (target chosen at finalization),
 *        702.3 (at most one buff per unit).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NAVORI_FIGHTING_PIT = "ogn-283-298";
const STUPEFY = "ogn-095-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** End of P2's turn 2. P1 holds the live Pit with TWO already-BUFFED units A (2+1) and B (3+1). P2 keeps Stupefy. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("pit", { controller: P1, def: NAVORI_FIGHTING_PIT, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "pit", { might: 2, name: "A" }, "a", { buffed: true })
    .unit(P1, "pit", { might: 3, name: "B" }, "b", { buffed: true })
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .hand(P2, STUPEFY, "stupefy");
}

/** P2 ends the turn → P1 holds the Pit; P1 locks the trigger's target on A. */
async function holdAndAimAtA(): Promise<Game> {
  const game = await board().build();
  expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
  expect(game.state("b")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pit" }, timing: "FIN" });
  expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["a", "b"]);
  await game.p1.pick("a");
  return game;
}

describe("Ruling 7e17d2adb7eef268 — the Pit's hold trigger goes on the chain (and can be reacted to) even when everything there is already buffed", () => {
  test("the trigger fires although A and B are both buffed: P1 is asked its target at FINALIZATION (before any priority) and the item sits on the chain aimed at A", async () => {
    const game = await holdAndAimAtA();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pit", controller: P1, targets: ["a"], triggered: true })]);
  });

  test("P2 CAN react: with the item on the chain P2 receives a Closed-state window in which Stupefy (Reaction) is legal, and casts it onto the same chain", async () => {
    const game = await holdAndAimAtA();
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.do("addResources", { energy: 1 }); // P2's pool emptied at its end of turn; refill [1] for Stupefy
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "b" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pit", "stupefy"]);
  });

  test("the target was locked before the window: P2's reaction cannot re-aim the Pit (its item still names A afterwards), and on resolution the already-buffed A gains NO second buff (still 2+1 = 3)", async () => {
    const game = await holdAndAimAtA();
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("stupefy", { targets: "b" });
    expect(game.chain().find((c) => c.cardId === "pit")?.targets).toEqual(["a"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("a")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("b")).toMatchObject({ isBuffed: true, might: 3 }); // 3 + 1 buff − 1 Stupefy this turn
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
