/**
 * Ruling b72586b81384ef37 — Noxian Drummer (OGN-222 → ogn-222-298) "When I move to a battlefield, play a 1 [Might] Recruit unit
 *   token here." × Zenith Blade (OGN-262 → ogn-262-298) Action [3][rainbow][rainbow] "Stun an enemy unit at a battlefield. You may
 *   move a friendly unit to that enemy unit's battlefield." × Hidden Blade (OGN-213 → ogn-213-298) [Hidden] [Action] "Kill a unit
 *   at a battlefield. Its controller draws 2."
 *
 * Q: Zenith Blade stuns a unit and moves the Drummer to that battlefield, where the opponent has Hidden Blade hidden. Can they
 *    kill the Drummer before the move trigger spawns the token?
 * A: Yes. Zenith Blade fully resolves; the Drummer's move trigger goes on the chain; the Drummer's controller gets priority first,
 *    then the opponent may flip Hidden Blade (a Reaction from hidden) and kill her; the trigger then resolves with no "here" → no
 *    token. If instead Hidden Blade is played as a plain Action (from hand, later in the showdown), the token has already spawned.
 * Rules: 383 (trigger is a chain item; controller gets priority first), 811 (hidden ⇒ Reaction for [0]), 359.3.f (null "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_DRUMMER = "ogn-222-298";
const ZENITH_BLADE = "ogn-262-298";
const HIDDEN_BLADE = "ogn-213-298";

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((r) => game.zoneOf(r) !== "gone");
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn (turn 3, so a card hidden earlier may be flipped). P2 holds bf1 with Guard (4) and Hidden Blade FACEDOWN there.
 * P1: Drummer in base, Zenith Blade + [3] + 2 rainbow. */
function hiddenBoard() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P2, "bf1", HIDDEN_BLADE, "hb")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** Zenith Blade: stun Guard, move Drummer → resolves; the Drummer's move trigger is now on the chain. */
async function zenithBladeResolves(game: Game): Promise<void> {
  await game.p1.cast("zb", { targets: ["guard", "drummer"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["zb"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.zoneOf("zb")).toBe("trash");
  expect(game.state("guard").isStunned).toBe(true);
  expect(game.zoneOf("drummer")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
}

describe("Ruling b72586b81384ef37 — Hidden Blade flipped in response to the Drummer's move trigger kills her before the token; as a plain Action it is too late", () => {
  test("Zenith Blade fully resolves (Guard stunned, Drummer at bf1), the move trigger is on the chain and P1 — its controller — holds priority FIRST; P2 cannot act yet", async () => {
    const game = await hiddenBoard().build();
    await zenithBladeResolves(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.can("reveal", "hb")).toBe(false);
    expect(recruits(game)).toEqual([]);
  });

  test("P1 passes → P2 gets priority and may flip the hidden Hidden Blade (Reaction, [0]) choosing the Drummer; it goes on top of her trigger", async () => {
    const game = await hiddenBoard().build();
    await zenithBladeResolves(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "hb")).toBe(true);
    await game.p2.reveal("hb", { answers: ["drummer"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["drummer", "hb"]);
    expect(game.p2.energy()).toBe(0); // played from hidden for [0]
  });

  test("Hidden Blade resolves first: the Drummer dies (P1 draws 2); then her trigger resolves with no 'here' → NO Recruit token is played anywhere", async () => {
    const game = await hiddenBoard().build();
    await zenithBladeResolves(game);
    await game.p1.passPriority();
    await game.p2.reveal("hb", { answers: ["drummer"] });
    const hand0 = game.p1.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade
    expect(game.zoneOf("drummer")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", triggered: true })]); // still pending
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Hidden Blade in HAND (an Action): P2 cannot answer the trigger with it; the token spawns at bf1; only in the ensuing showdown can P2 cast it to kill the Drummer, and the Recruit stays", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .resources(P2, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P2, HIDDEN_BLADE, "hb")
      .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
      .hand(P1, ZENITH_BLADE, "zb")
      .build();
    await zenithBladeResolves(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "hb")).toBe(false); // an Action cannot be played onto a chain
    await game.p2.passPriority(); // trigger resolves
    expect(recruits(game)).toHaveLength(1);
    const token = recruits(game)[0] as string;
    expect(game.locationOf(token)).toBe("bf1");
    // Drummer + Recruit at P2's bf1 → combat showdown; P1 (attacker) has focus first, then P2 may cast Hidden Blade as an Action.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.p2.can("cast", "hb")).toBe(true);
    await game.p2.cast("hb", { targets: "drummer" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("drummer")).toBe("trash");
    expect(game.zoneOf(token)).toBe("battlefield-bf1"); // the token was already played and stays
  });
});
