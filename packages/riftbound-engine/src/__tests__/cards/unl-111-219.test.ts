/**
 * Determined Sentry — unl-111-219 · Unit · Body · 1 energy · 1 Might
 *
 *   I can't move to base.
 *
 * Rules: 144.4.b (a Standard Move may go battlefield → base), 410.1.b.3 (a discretionary action may
 * not create a forbidden state), 359.3.e.6 (an effect instruction that can't be followed — "move to
 * base" on a unit that can't — is IGNORED; the Ride-the-Wind-at-Vilemaw's-Lair example), 455/456.3
 * (a Recall is not a Move and cannot be stopped by movement restrictions), 810 (Ganking: bf → bf).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "I" — only the Sentry is bound; a vanilla ally beside it may still walk home, and a multi-unit
 *      Standard Move that includes the Sentry with destination base is illegal as a whole.
 *   2. Only the BASE destination is forbidden: base → battlefield is fine, and with Ganking granted
 *      (Vault Breaker) battlefield → battlefield is fine too.
 *   3. Effect-driven moves (Fight or Flight by either player, Isolate by the opponent) may CHOOSE the
 *      Sentry (it is "a unit at a battlefield") but the move instruction is ignored on resolution —
 *      the spell is still spent.
 *   4. Recalls are not moves: a Sentry that attacks into a surviving defender is recalled home by the
 *      combat cleanup (466.1.a.2), and Zhonya-style "recall it" effects would work too.
 *   5. "Return to hand" (Retreat) is a zone change, not a move — unaffected.
 *   6. Cost: 1 energy, no power, enters exhausted; 0 energy → unplayable.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-111-219";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // Action spell, 2: move a unit from a battlefield to its base
const ISOLATE = "unl-124-219"; // spell, 2: move an ENEMY unit from a battlefield to its base; then maybe draw
const VAULT_BREAKER = "unl-010-219"; // Action spell, 1 fury: give a unit Assault 2 and Ganking this turn
const RETREAT = "ogn-104-298"; // Reaction spell, 1: return a friendly unit to its owner's hand

/** Sentry + a vanilla ally on P1's bf1 (holder keeps control), P2 holds bf2. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "sentry")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe");
}

describe("Determined Sentry (unl-111-219)", () => {
  test("registry payload: 1-cost body 1-Might unit whose only ability is a static self-grant of a can't-move-to-base marker", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 1, might: 1, name: "Determined Sentry" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { target: "self", type: "grant-keyword" }, type: "static" });
    const kw = (def?.abilities?.[0] as { effect: { keyword: string } }).effect.keyword;
    expect(kw).toMatch(/MoveToBase/);
  });

  test("cost: 1 energy, no power; enters the base exhausted as a 1-Might unit; 0 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "sentry").build();
    await game.p1.play("sentry");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("sentry")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1, zone: "base" });
    expect((await scenario().resources(P1, { energy: 0 }).hand(P1, CARD, "sentry").build()).p1.can("play", "sentry")).toBe(false);
  });

  test("the Sentry's Standard Move back to base must be illegal (144.4.b + 410.1.b.3) while the vanilla ally beside it may still go home", async () => {
    // Expected: move(sentry → base) is rejected and the Sentry stays on bf1; the ally's own move home is
    // legal. Actual: the card grants `CantMoveToBase` but the engine only consults `NoMoveToBase`, so
    // the Sentry walks home freely.
    const game = await board().build();
    const r = await game.p1.try((p) => p.move("sentry", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sentry")).toBe("bf1");
    await game.p1.move("ally", "base");
    expect(game.locationOf("ally")).toBe("base");
  });

  test("a multi-unit Standard Move to base that includes the Sentry is illegal as a whole — neither unit moves", async () => {
    // Expected: the bundle [sentry, ally] → base is refused; both stay on bf1. Actual: both move.
    const game = await board().build();
    const r = await game.p1.try((p) => p.move(["sentry", "ally"], "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.locationOf("ally")).toBe("bf1");
  });

  test("only the base is forbidden: a Sentry in base may Standard-Move OUT to a battlefield (and arrives exhausted)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "sentry").build();
    await game.p1.move("sentry", "bf1");
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.state("sentry").isExhausted).toBe(true);
  });

  test("with Ganking (Vault Breaker) the Sentry may move battlefield → battlefield; the restriction is about the destination, not about leaving", async () => {
    const game = await board().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, VAULT_BREAKER, "vb").build();
    expect(game.p1.can("gank", "sentry")).toBe(false); // no Ganking yet
    await game.p1.cast("vb", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "sentry")).toBe(true);
    await game.p1.gank("sentry", "bf2");
    expect(game.locationOf("sentry")).toBe("bf2");
  });

  test("effect-driven move (own Fight or Flight) — the Sentry may be chosen but the move instruction is ignored (359.3.e.6); the spell is still spent", async () => {
    // Expected: Sentry stays on bf1, Fight or Flight goes to trash, 2 energy paid. Actual: the Sentry is moved home.
    const game = await board().resources(P1, { energy: 2 }).hand(P1, FIGHT_OR_FLIGHT, "fof").build();
    await game.p1.cast("fof", { targets: "sentry" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("sentry")).toBe("bf1");
  });

  test("control: the same Fight or Flight on the vanilla ally DOES send it home (proves the board, not the spell, is what differs)", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, FIGHT_OR_FLIGHT, "fof").build();
    await game.p1.cast("fof", { targets: "ally" });
    await game.settle();
    expect(game.locationOf("ally")).toBe("base");
    expect(game.locationOf("sentry")).toBe("bf1");
  });

  test("the OPPONENT's Isolate cannot push the Sentry home either — it stays and keeps holding bf1", async () => {
    // Expected: after P2's Isolate resolves the Sentry is still on bf1 and P1 still controls it.
    // Actual: the Sentry is moved to P1's base.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sentry")
      .hand(P2, ISOLATE, "iso")
      .build();
    await game.p2.cast("iso", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("iso")).toBe("trash");
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("a combat RECALL is not a Move (456.3): a lone Sentry attacking into a surviving 5-Might stunned defender is recalled to base by the combat cleanup", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sentry")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .build();
    await game.p1.move("sentry", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("a real fight: the 1-Might Sentry attacking a 1-Might defender trades — both die (it is just a 1/1 otherwise)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sentry")
      .unit(P2, "bf1", { might: 1, name: "Peer" }, "peer")
      .build();
    await game.p1.move("sentry", "bf1");
    await game.settle();
    expect(game.zoneOf("peer")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 466.5.b: no units left → uncontrolled
    expect(game.p1.points()).toBe(0);
  });

  test("'return to hand' is not a move: Retreat lifts the Sentry off bf1 into its owner's hand", async () => {
    const game = await board().resources(P1, { energy: 1 }).hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("retreat", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("hand");
    expect(game.p1.hand()).toContain("sentry");
    expect(game.violations()).toEqual([]);
  });
});
