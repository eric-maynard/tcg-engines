/**
 * Core rules — WHEN a staged Showdown / Combat begins after a Standard Move.
 *
 *   323.8 / 323.9    the Move's Cleanup marks the Showdown / Combat as Staged where Contested was applied
 *   401.1            the mover's own "When I move" trigger is a Pending Item → Closed State
 *   323.12 / 323.13  a staged Showdown / Combat BEGINS only in a Neutral Open State (344, 460): with no
 *                    trigger that is the Move's own Cleanup; with a trigger it is the Cleanup after the
 *                    chain empties
 *   323.8.a / 323.11 a battlefield whose contesting player has no unit left stops being Contested — a
 *                    unit removed in response never gets a Showdown
 *   323.13 / 461.1   two Combats staged at once: the Turn Player picks one; the other begins only after
 *                    the first has completely finished (460)
 *   345 / 464.2.c    Focus to the player who applied Contested; that player's units attack, the rest defend
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Unit: "When I move, draw 1." */
const SCOUT = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  might,
  name: "Scout (inline: When I move, draw 1)",
});

/** Reaction spell: "Move an enemy unit at a battlefield to its base." */
const GUST = {
  abilities: [
    {
      effect: { target: { controller: "enemy", location: "battlefield", type: "unit" }, to: "base", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Gust (inline reaction: Move an enemy unit at a battlefield to its base)",
  timing: "reaction",
};

/** Reaction spell: "Move a friendly unit in your base to a battlefield." (destination chosen as it is played — 355.4) */
const MARCH = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "base", type: "unit" }, to: { battlefield: "any" }, type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "March (inline reaction: Move a friendly unit in your base to a battlefield)",
  timing: "reaction",
};

function topShowdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

function activeShowdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((sd) => sd.active);
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("323.13 / 344 — a Standard Move WITHOUT a trigger: the Move's own Cleanup is Neutral Open, so the Combat begins in the same action", () => {
  test("vanilla mover into an enemy battlefield: Combat Showdown open at once, P1 attacks with Focus, the occupant defends", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Grunt" }, "grunt")
      .deck(P1, ["ogn-001-298"], ["d1"])
      .build();
    await game.p1.move("grunt", "bf1");
    expect(game.chain()).toEqual([]);
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(topShowdown(game)?.autoBegun).not.toBe(true); // the mover chose it — drivers pass Focus through
    expect(game.state("grunt").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("vanilla mover onto an empty battlefield: Non-Combat Showdown open at once with P1's Focus; settle() passes it through to the Conquer", async () => {
    const game = await scenario().battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Grunt" }, "grunt").build();
    await game.p1.move("grunt", "open");
    expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "open", focusPlayer: P1, isCombatShowdown: false });
    expect((await game.settle()).reason).toBe("open");
    expect(game.gameState.battlefields.open).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("401.1 / 323.13 — a Standard Move whose mover queues its own 'When I move' trigger: Closed State, the Combat stays STAGED until the chain empties", () => {
  test("into an enemy battlefield: Contested by P1 but no Showdown, no designations, P1 holds PRIORITY; after both pass the trigger resolves and only then Combat begins with P1's Focus and the roles", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", SCOUT(3), "scout")
      .deck(P1, ["ogn-001-298", "ogn-001-298"], ["d1", "d2"])
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });

    await game.p1.passPriority();
    expect(activeShowdowns(game)).toEqual([]); // still Closed: P2 may respond
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority(); // trigger resolves → Neutral Open → the Cleanup begins the staged Combat
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(topShowdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(topShowdown(game)?.autoBegun).not.toBe(true);
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("onto an empty battlefield: the Non-Combat Showdown also waits for the trigger; one settle() then resolves the trigger, passes the Showdown through and Conquers — same as without a trigger", async () => {
    const game = await scenario()
      .battlefield("open", { controller: null })
      .unit(P1, "base", SCOUT(1), "scout")
      .deck(P1, ["ogn-001-298", "ogn-001-298"], ["d1", "d2"])
      .build();
    await game.p1.move("scout", "open");
    expect(game.chain()).toHaveLength(1);
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.open).toMatchObject({ contested: true, contestedBy: P1 });
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("d1")).toBe("hand");
    expect(game.gameState.battlefields.open).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("323.8.a / 323.11 — the mover is Gusted back to base in response: once the chain empties nothing of P1's is there, Contested is removed and NO Showdown ever begins; P2 keeps the battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", SCOUT(3), "scout")
      .deck(P1, ["ogn-001-298", "ogn-001-298", "ogn-001-298"], ["d1", "d2", "d3"])
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "scout" });
    await resolveChain(game);
    expect(game.locationOf("scout")).toBe("base");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });
});

describe("323.13 / 460 / 461.1 — two Combats staged in the same Closed State: the Turn Player picks one, and the other begins only after the first has completely finished", () => {
  /** Scout walks into bfA (trigger → Closed); in response P1 Marches Grunt into bfB; the chain then empties with BOTH Combats staged by P1. */
  async function twoStaged(manual: boolean): Promise<Game> {
    const b = scenario()
      .battlefield("bfA", { controller: P2 })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfA", { might: 2, name: "Guard A" }, "guardA")
      .unit(P2, "bfB", { might: 2, name: "Guard B" }, "guardB")
      .unit(P1, "base", SCOUT(3), "scout")
      .unit(P1, "base", { might: 3, name: "Grunt" }, "grunt")
      .deck(P1, ["ogn-001-298", "ogn-001-298"], ["d1", "d2"])
      .hand(P1, MARCH, "march");
    const game = await (manual ? b.autoProcedures(false) : b).build();
    await game.p1.move("scout", "bfA");
    await game.p1.cast("march", { answers: ["battlefield-bfB"], targets: "grunt" }); // 355.4: destination named at play
    await game.p1.passPriority();
    await game.p2.passPriority(); // March resolves
    expect(game.locationOf("grunt")).toBe("bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", triggered: true })]);
    expect(activeShowdowns(game)).toEqual([]); // both merely staged
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves → Neutral Open with two staged Combats
    expect(game.chain()).toEqual([]);
    return game;
  }

  test("the Turn Player is asked which Combat begins (both battlefields offered, nothing open yet); picking bfB opens bfB only — bfA keeps no roles", async () => {
    const game = await twoStaged(true);
    expect(activeShowdowns(game)).toEqual([]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", seat: P1 });
    const starts = d?.kind === "action" ? d.options.filter((o) => o.moveId === "startShowdown") : [];
    expect(starts.map((o) => o.key).sort()).toEqual([expect.stringContaining("bfA"), expect.stringContaining("bfB")]);
    await game.p1.choose(starts.find((o) => o.key.includes("bfB"))!.key);
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(topShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("grunt").combatRole).toBe("attacker");
    expect(game.state("guardB").combatRole).toBe("defender");
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.state("guardA").combatRole).toBeNull();
  });

  test("one at a time: whichever Combat runs first is completely finished (damage dealt, Guard dead, Contested cleared, conquered) before the other opens; both end conquered by P1 (+2)", async () => {
    const game = await twoStaged(false); // the driver takes the first offered start
    expect(activeShowdowns(game)).toHaveLength(1);
    const first = topShowdown(game)!.battlefieldId;
    const other = first === "bfA" ? "bfB" : "bfA";
    const [firstGuard, otherGuard] = first === "bfA" ? ["guardA", "guardB"] : ["guardB", "guardA"];
    expect(game.state(otherGuard).combatRole).toBeNull();
    await game.acting().passFocus();
    await game.acting().passFocus(); // first combat: damage step + resolution + Cleanup
    expect(game.zoneOf(firstGuard)).toBe("trash");
    expect(game.gameState.battlefields[first]).toMatchObject({ contested: false, controller: P1 });
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(topShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: other, isCombatShowdown: true });
    expect(game.state(otherGuard).combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf(otherGuard)).toBe("trash");
    expect(game.gameState.battlefields[other]).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
