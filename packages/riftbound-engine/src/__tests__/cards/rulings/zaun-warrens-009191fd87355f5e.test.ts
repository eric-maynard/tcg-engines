/**
 * Ruling 009191fd87355f5e — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield
 *   "When you conquer here, discard 1, then draw 1."
 *
 * Q: Can you refuse to finalize Zaun Warrens' conquer trigger under the rule that lets you decline triggered abilities
 *    that incur a COST when finalized?
 * A: No. Zaun Warrens incurs no cost at finalization — the discard is an instruction performed at resolution ("[cost] to
 *    [effect]" / "as an additional cost" templating would be a cost; "discard 1, then draw 1" is not). The trigger goes on
 *    the chain and resolves; nothing is offered to decline.
 * Rules: 383.3.a/b (only "you may [cost] to …" style triggers may be declined at finalization), 402–404, 421 (discard).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";

/** P1's turn. bf1 = Zaun Warrens (live text) held by P2's 1-Might Wall. P1: a 4-Might Raider in base and two known hand cards. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Dead Weight" }, "junk")
    .hand(P1, { cardType: "unit", energyCost: 8, might: 8, name: "Keeper" }, "keep")
    .deck(P1, ["ogn-175-298"], ["topdeck"]);
}

/** Raider attacks bf1; both pass Focus; combat resolves (Wall dies, P1 conquers). */
async function conquerWarrens(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("wall")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling 009191fd87355f5e — Zaun Warrens' conquer trigger has no finalization cost, so it cannot be refused", () => {
  test("on conquering the Warrens the trigger is FINALIZED onto the chain straight away — no yes/no offer, nothing to decline; P1 simply holds priority over it", async () => {
    const game = await conquerWarrens();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Zaun Warrens", triggered: true })]);
    const d = game.decision();
    expect(d?.kind).not.toBe("yes-no");
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.hand().toSorted()).toEqual(["junk", "keep"]); // nothing discarded yet: the discard is not a cost
  });

  test("it resolves as an instruction: P1 must discard 1 (P1 picks which — no 'decline'), then draws 1", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    // settle() stops at the discard pick (a real choice between two hand cards).
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["junk", "keep"]);
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["keep", "topdeck"]); // discarded 1, then drew 1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
