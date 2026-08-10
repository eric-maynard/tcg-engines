/**
 * Ruling 8daa2b3e055cf7bb — Wages of Pain (SFD-070 → sfd-070-221, [Hidden][Action] "Deal 3 to a unit at a battlefield.
 *   Play a Gold gear token exhausted.") × Overzealous Fan (SFD-128 → sfd-128-221, 2 Might) × Ride the Wind (OGN-173 →
 *   ogn-173-298, "Move a friendly unit and ready it.") × Gold token (sfd-t03).
 *
 * Q: Opponent plays Wages of Pain on my Fan at my battlefield; can I Ride the Wind it to another (enemy, empty)
 *    battlefield in response and score a point?
 * A: Only if the Fan survives the 3 damage. Ride the Wind resolves first (Fan moves; the showdown there is merely
 *    STAGED — it cannot begin while the chain is resolving); then Wages resolves and deals 3. Fan dies → no showdown,
 *    no point. Fan survives (>3 Might) → the staged showdown begins after Wages' cleanup and can be won. The Gold token
 *    is created either way.
 * Rules: 344.2 / 340 (staged showdowns begin only from a Neutral Open state), 332 (LIFO), 359.3.e (target still legal
 *        after moving: "a unit at a battlefield"), 442 (conquer scoring).
 *
 * Note: Ride the Wind is an [Action]; to give P1 the reaction-speed response the ruling presupposes it is placed
 * facedown at P1's battlefield (a card played from facedown has [Reaction], rule 811) — the chain physics under test
 * (move resolves above Wages, staged showdown waits) are unchanged.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const OVERZEALOUS_FAN = "sfd-128-221";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn 3. P1 holds bf1 with the Fan (+`extraMight`); P2 controls the EMPTY bf2; P2 casts Wages [3] on the Fan. */
function board(extraMight = 0) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", OVERZEALOUS_FAN, "fan", extraMight > 0 ? { mightModifier: extraMight } : undefined)
    .facedown(P1, "bf1", RIDE_THE_WIND, "rtw")
    .hand(P2, WAGES_OF_PAIN, "wages");
}

const bf2 = (game: Game) => game.gameState.battlefields.bf2;
const golds = (game: Game) => game.findAll({ name: "Gold" });

/** Wages[fan] on the chain; P1 responds with Ride the Wind[fan → bf2]; both pass once so ONLY Ride the Wind resolves. */
async function wagesThenRideResolvesFirst(extraMight = 0): Promise<Game> {
  const game = await board(extraMight).build();
  await game.p2.cast("wages", { targets: "fan" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wages", controller: P2, targets: ["fan"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.reveal("rtw");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fan", pendingChoiceType: "choose-destination" } });
  await game.p1.pick("battlefield-bf2");
  expect(game.chain().map((c) => c.cardId)).toEqual(["wages", "rtw"]); // Ride the Wind is HIGHER on the chain
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling 8daa2b3e055cf7bb — Ride the Wind in response to Wages of Pain: the staged showdown only happens if the Fan survives", () => {
  test("Ride the Wind resolves first: Fan is now at bf2 (ready), bf2 is contested/STAGED by P1 — but no showdown has begun, Wages is still on the chain and priority continues", async () => {
    const game = await wagesThenRideResolvesFirst();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("fan")).toBe("bf2");
    expect(game.state("fan").isReady).toBe(true);
    expect(bf2(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2, stagedBy: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active ?? false).toBe(false); // staged, not begun
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wages", targets: ["fan"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("Fan at 2 Might: Wages then resolves and deals 3 — the Fan dies, NO showdown ever occurs at bf2 and P1 scores nothing; P2 still gets its exhausted Gold token", async () => {
    const game = await wagesThenRideResolvesFirst();
    await game.acting().passPriority();
    await game.acting().passPriority(); // Wages resolves
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("fan")).toBe("trash");
    await game.settle();
    expect(game.p1.points()).toBe(0);
    expect(bf2(game)?.contested).toBe(false);
    expect(bf2(game)?.controller).not.toBe(P1);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(golds(game)).toHaveLength(1);
    expect(game.state(golds(game)[0] as string)).toMatchObject({ controller: P2, isExhausted: true, isToken: true });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("Fan at 4 Might (survives 3): after Wages' cleanup the STAGED showdown at bf2 begins from the open state; nobody contests it → P1 conquers bf2 and scores 1; the Gold token exists too", async () => {
    const game = await wagesThenRideResolvesFirst(2);
    expect(game.state("fan").might).toBe(4);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Wages resolves: 3 damage, Fan lives
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.state("fan").damage).toBe(3);
    expect(game.locationOf("fan")).toBe("bf2");
    // Now — and only now — the staged showdown opens (non-combat: P2 has no units there).
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(sd?.isCombatShowdown ?? false).toBe(false);
    await game.settle(); // both pass focus → P1 takes bf2
    await game.settle();
    expect(bf2(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toHaveLength(1);
    expect(game.state(golds(game)[0] as string).controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
