/**
 * Ruling 4346ea5891ff02bf — Baited Hook (OGN-242 → ogn-242-298) · Gear · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *    banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *    ignoring its cost. Then recycle the rest."
 *
 * Q: Can I activate Baited Hook in response to a spell?
 * A: No. A gear's activated ability with no [Reaction] keyword is base speed: it may only be used in
 *    your own Main Phase while the game state is Open (no chain). A spell on the chain closes the
 *    state, so the Hook cannot answer it — and it can never be used on the opponent's turn.
 * Rules: 150.2 (gear activated abilities: your Main Phase, Open State), 420.1 (base speed),
 *        421.2 (Reaction speed is what would allow a Closed State), 309 (Open vs Closed State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const DREDGE_UP = "ven-049-166"; // a cheap spell to put on the chain
/** A plain [Reaction] spell for P2, so a chain can be built during P1's turn. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

/** P1's turn. P1: Baited Hook (ready), a Fodder unit to feed it, [3][order]; both seats hold a Dredge Up. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 2, name: "Fodder" }, "fodder")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, TRICK, "trick")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"]);
}

const canHook = (game: Game) => game.p1.can("activate", "hook");

describe("Ruling 4346ea5891ff02bf — Baited Hook has no [Reaction], so it cannot be activated in response to a spell", () => {
  test("premise: in P1's OPEN main phase the Hook is activatable (ready, [1][order] affordable, a friendly unit to kill)", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.state("hook").isReady).toBe(true);
    expect(canHook(game)).toBe(true);
  });

  test("ruling 4346ea5891ff02bf — with P1's own spell on the chain the state is Closed: the Hook is gone from P1's menu and activating it is refused", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(canHook(game)).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility" && o.card === "hook")).toBe(false);
    const r = await game.p1.try((p) => p.activate("hook"));
    expect(r.ok).toBe(false);
    expect(game.state("hook").isReady).toBe(true);
    expect(game.zoneOf("fodder")).toBe("base"); // nothing was killed
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } }); // only Dredge Up's [2] left the pool
  });

  test("same while the OPPONENT's spell sits on the chain during P1's turn", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    await game.p1.passPriority();
    await game.p2.cast("trick");
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "trick"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(canHook(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("hook"))).ok).toBe(false);
  });

  test("once the chain empties and the state is Open again, the very same Hook activates normally (Fodder killed, [1][order] paid, gear exhausted)", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(canHook(game)).toBe(true);
    await game.p1.activate("hook", 0, { targets: "fodder" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.p1.power("order")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("and it is unusable on the opponent's turn, chain or no chain", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { order: 1 } })
      .resources(P2, { energy: 2 })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", { might: 2, name: "Fodder" }, "fodder")
      .hand(P2, DREDGE_UP, "p2dredge")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"])
      .build();
    expect(canHook(game)).toBe(false);
    await game.p2.cast("p2dredge");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(canHook(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("hook"))).ok).toBe(false);
  });
});
