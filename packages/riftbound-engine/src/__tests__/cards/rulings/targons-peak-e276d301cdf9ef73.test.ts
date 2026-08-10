/**
 * Ruling e276d301cdf9ef73 — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * Q: Does Targon's Peak's ability create a window to React?
 * A: Yes, two: (1) right after you conquer, its "When you conquer here" trigger is on the chain and players may play
 *    Reactions before it resolves (it then sets up the delayed ability); (2) in the Ending Step the delayed "ready up to 2
 *    runes" is added to the chain and Reactions may again be played before it resolves. Neither window can stop the runes
 *    from readying once the respective ability resolves.
 * Rules: 383 / 337 (a triggered ability is a chain item; priority before resolution), 317.1 (end-of-turn triggers),
 *        386 (delayed triggered abilities), 354 (Reactions in a Closed State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";

/** P2's [0] Reaction (inline): deal 1 to a unit — just something legal to play in each window. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Ping",
  timing: "reaction",
} as const;

/** P1's turn. The live Peak is uncontrolled and empty; P1's Climber (3) in base; P1 has 3 EXHAUSTED runes; P2 holds two Pings. */
function board() {
  return scenario()
    .battlefield("peak", { controller: null, def: TARGONS_PEAK, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .runes(P1, "fury", 3, { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Climber" }, "climber")
    .hand(P2, PING, "ping1")
    .hand(P2, PING, "ping2");
}

/** Climber walks onto the empty Peak; both pass Focus → P1 conquers. Stops with the conquer trigger on the chain. */
async function conquerPeak(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("climber", "peak");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.peak?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling e276d301cdf9ef73 — Targon's Peak opens two Reaction windows: on the conquer trigger and on the end-of-turn delayed trigger", () => {
  test("window 1: right after the conquer the Peak's 'When you conquer here' trigger is a chain item; P1 then P2 get priority and P2 CAN play a Reaction onto it", async () => {
    const game = await conquerPeak();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ping1")).toBe(true);
    await game.p2.cast("ping1", { targets: "climber" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["peak", "ping1"]);
    await game.settle(); // Ping resolves, then the trigger resolves and sets up the delayed ability
    expect(game.chain()).toEqual([]);
    expect(game.state("climber").damage).toBe(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // nothing readied yet — that is for the end of turn
    expect(game.turnPlayer()).toBe(P1);
  });

  test("window 2: at the Ending Step the delayed 'ready up to 2 runes' is added to the chain (P1 names its up-to-2 runes as it is finalized); before it resolves P2 again gets priority and CAN react", async () => {
    const game = await conquerPeak();
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 2, seat: P1 });
    const runes = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(runes).toHaveLength(3);
    await game.p1.pick(runes[0]!, runes[1]!);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // chosen, not yet readied — the item still has to resolve
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ping2")).toBe(true);
    await game.p2.cast("ping2", { targets: "climber" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["peak", "ping2"]);
  });

  test("neither reaction stops it: with a Ping played in BOTH windows, the delayed ability still resolves and exactly the 2 chosen runes are ready going into P2's turn", async () => {
    const game = await conquerPeak();
    await game.p1.passPriority();
    await game.p2.cast("ping1", { targets: "climber" });
    await game.settle();
    await game.p1.endTurn();
    const d = game.decision();
    const runes = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    await game.p1.pick(runes[0]!, runes[1]!);
    await game.p1.passPriority();
    await game.p2.cast("ping2", { targets: "climber" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true }).slice().sort()).toEqual([runes[0]!, runes[1]!].sort());
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("ping1")).toBe("trash");
    expect(game.zoneOf("ping2")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
