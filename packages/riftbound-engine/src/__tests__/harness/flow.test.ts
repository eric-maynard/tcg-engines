/**
 * Harness self-tests: settle(), turn advancement, scripts, hidden info,
 * game end, and the shared TurnDriver.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { Game, P1, P2, endTurn, firstOptionPolicy, isHiddenView, scenario } from "../../harness";
import { advanceTurn as legacyAdvanceTurn, createPlayableGame, buildDefaultDeck } from "../../testing/playtest/game-setup";

const CLEAVE = "ogn-004-298";
const STACKED_DECK = "ogn-183-298";
const LOOSE_CANNON = "ogn-251-298";
const SKULKER = "ogn-175-298";

describe("settle()", () => {
  test("passes priority both ways and stops at the open main-phase decision", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 1 }, "u").hand(P1, CLEAVE, "c").build();
    await game.p1.cast("c", { targets: "u" });
    const s = await game.settle();
    expect(s).toMatchObject({ reason: "open", steps: 2 });
    expect((s.decision as ActionDecision).context).toBe("main");
    expect(game.zoneOf("c")).toBe("trash");
  });

  test("stops 'unanswered' at a real prompt; strict scripts throw UNSCRIPTED_DECISION; 'first' policy resolves it", async () => {
    const mk = () => scenario().resources(P1, { energy: 1 }).hand(P1, STACKED_DECK, "sd").deck(P1, [CLEAVE, CLEAVE, CLEAVE], ["a", "b", "c"]);
    const loose = await mk().build();
    await loose.p1.cast("sd");
    expect((await loose.settle()).reason).toBe("unanswered");

    const strict = await mk().script(P1, [], { strict: true }).build();
    await strict.p1.cast("sd");
    await expect(strict.settle()).rejects.toThrow(/UNSCRIPTED_DECISION.*Pick a revealed card/);

    const scripted = await mk().script(P1, ["b"], { strict: true }).build();
    await scripted.p1.cast("sd");
    expect((await scripted.settle()).reason).toBe("open");
    expect(scripted.p1.hand()).toEqual(["b"]);
    expect(scripted.pendingScript(P1)).toBe(0);

    const first = await mk().build();
    await first.p1.cast("sd");
    expect((await first.settle({ policy: "first" })).reason).toBe("open");
    expect(first.p1.hand()).toEqual(["a"]);
    expect(firstOptionPolicy).toBeFunction();
  });

  test("script functions see the decision and may abstain", async () => {
    const seen: string[] = [];
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [CLEAVE, SKULKER, CLEAVE], ["a", "b", "c"])
      .script(P1, [
        (d) => {
          seen.push(d.kind);
          return d.kind === "pick" ? d.options.find((o) => o.label.startsWith("Shipyard"))?.key : undefined;
        },
      ])
      .build();
    await game.p1.cast("sd");
    await game.settle();
    expect(seen).toEqual(["action", "pick"]); // consulted (abstained) on the priority window, answered the prompt
    expect(game.p1.hand()).toEqual(["b"]);
  });
});

describe("turn advancement", () => {
  test("endTurn() rotates via the TurnDriver: next player readied, channeled 2, drew 1, pools emptied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P2, "base", { might: 1 }, "tired", { exhausted: true })
      .build();
    const p2Hand = game.p2.hand().length;
    const r = await game.p1.endTurn();
    expect(r.executed[0]?.moveId).toBe("endTurn");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(3);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.state("tired").isReady).toBe(true);
    expect(game.actingSeat()).toBe(P2);
    expect((game.p2.decision() as ActionDecision).context).toBe("main");
  });

  test("advanceTurn() settles start-of-turn triggers (Loose Cannon holds the beginning phase on the chain)", async () => {
    const game = await scenario().turn(2).active(P2).legend(P1, LOOSE_CANNON, "lc").hand(P1, SKULKER).build();
    const before = game.p1.hand().length;
    const res = await game.advanceTurn();
    expect(res).toEqual({ next: P1, turn: 3 });
    expect(game.phase()).toBe("main");
    // trigger draw (hand ≤1) + draw phase
    expect(game.p1.hand()).toHaveLength(before + 2);
    const steps = game.transcript().steps.map((s) => `${s.seat}:${s.executed.map((e) => e.moveId).join("+")}`);
    expect(steps).toEqual(["player-2:endTurn", "player-1:passChainPriority", "player-2:passChainPriority"]);
  });

  test("advanceTurn() refuses while a battlefield is contested and says why", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "u1")
      .unit(P2, "bf1", { might: 4 }, "e1")
      .autoProcedures(false)
      .build();
    await game.p1.move("u1", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // Without auto procedures the Combat Damage Step is surfaced as an option and endTurn is blocked.
    expect(game.p1.can("resolveCombat")).toBe(true);
    await expect(game.advanceTurn()).rejects.toThrow(/contested: bf1/);
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("advanceToTurnOf() loops turns", async () => {
    const game = await scenario().build();
    await game.advanceToTurnOf(P2);
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceToTurnOf(P2);
    expect(game.turnNumber()).toBe(3);
    await game.advanceToTurnOf(P1);
    expect(game.turnNumber()).toBe(4);
  });

  test("legacy game-setup advanceTurn delegates to the same driver (createPlayableGame smoke)", async () => {
    const { getAllCards } = await import("../../../../riftbound-cards/src/data/all-cards");
    const all = getAllCards() as unknown as Parameters<typeof createPlayableGame>[0];
    const d1 = buildDefaultDeck(all, "fury", "chaos");
    const d2 = buildDefaultDeck(all, "calm", "mind");
    const { engine } = createPlayableGame(all, d1, d2, "drv");
    // The harness can attach to any live engine; the fury/chaos legend (Loose Cannon) opens
    // the game with its start-of-turn trigger on the chain, so settle first.
    const game = Game.attach(engine, { players: [P1, P2] });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand().length).toBeGreaterThan(0);
    expect(game.p1.legal().some((o) => o.verb === "tapRune")).toBe(true);
    const a = legacyAdvanceTurn(engine, [P1, P2]);
    expect(a.success).toBe(true);
    expect(engine.getState().turn.activePlayer).toBe(P2);
    await game.settle();
    const b = endTurn(engine, [P1, P2]);
    expect(b).toMatchObject({ next: P1, success: true });
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
  });
});

describe("hidden information", () => {
  test("seat views redact other hands/decks; spectator sees all; own hand visible", async () => {
    const game = await scenario().hand(P1, CLEAVE, "mine").hand(P2, CLEAVE, "theirs").build();
    const v1 = game.p1.view();
    const p1Hand = v1.zones.hand?.filter((c) => !isHiddenView(c) && c.owner === P1) ?? [];
    const p2HandSeenByP1 = v1.zones.hand?.filter((c) => c.owner === P2) ?? [];
    expect(p1Hand.map((c) => (c as { id: string }).id)).toEqual(["mine"]);
    expect(p2HandSeenByP1.every(isHiddenView)).toBe(true);
    // Deck order is secret to everyone (including its owner); only counts leak.
    expect(v1.zones.mainDeck?.every(isHiddenView)).toBe(true);
    expect(v1.zones.mainDeck?.filter((c) => c.owner === P1)).toHaveLength(10);
    expect(JSON.stringify(v1.zones.mainDeck)).not.toContain("filler");
    const spec = game.view();
    expect(spec.viewer).toBe("spectator");
    expect(JSON.stringify(spec.zones.hand)).toContain("theirs");
    expect(v1.resources[P2]).toEqual({ energy: 0, power: {} });
    expect(v1.turn).toEqual({ activePlayer: P1, number: 2, phase: "main" });
    expect(v1.actingSeat).toBe(P1);
  });
});

describe("game end", () => {
  test("concede ends the game; decisions become null and acts report GAME_OVER", async () => {
    const game = await scenario().build();
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.decision()).toBeNull();
    const r = await game.act(P2, { key: "endTurn:-", kind: "action" });
    expect(!r.ok && r.error.code).toBe("GAME_OVER");
    expect((await game.settle()).reason).toBe("game-over");
  });

  test("reaching the victory score via conquest finishes the game", async () => {
    const game = await scenario()
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "u")
      .build();
    await game.p1.move("u", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
