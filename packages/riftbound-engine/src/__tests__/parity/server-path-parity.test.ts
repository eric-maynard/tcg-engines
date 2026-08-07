/**
 * Server-path parity: the app server (apps/riftbound-app/server → turn.ts
 * applySessionMove) and the headless harness must sequence the engine through
 * ONE path (harness/turn-driver.ts `applyMove`), so after any move the seat
 * menus (`enumerateMoves`, validOnly) are identical on both and the engine
 * state alone says which showdown / combat / chain is in progress.
 *
 * Each shape drives the same scenario down both paths in lock-step —
 * harness verbs on one side, "client sends an enumerated move" on the other —
 * and asserts (a) identical menus and (b) the rules expectation itself.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { ParityPair, has, playLocations } from "./parity-helpers";

// Real cards (ids from the default pool).
const INFERNA = "unl-002-219"; //   unit  · 2      · [Ambush] [Assault 2]
const CLEAVE = "ogn-004-298"; //    spell · 1      · [Action] give a unit Assault 3
const EN_GARDE = "ogn-046-298"; //  spell · 1      · [Reaction] +1 might
const DISCIPLINE = "ogn-058-298"; // spell · 2     · [Reaction] +2 might, draw 1
const MOBILIZE = "ogn-134-298"; //  spell · 2      · standard timing (channel 1 exhausted)
const SHADOW_FIEND = "ven-014-166"; // unit · [Empower] [2][fury]
const BLIND_MONK = "ogn-257-298"; // legend · [1], [Exhaust]: buff a friendly unit
const RAVENBORN_TOME = "ogn-032-298"; // gear · [Exhaust]: next spell +1 damage
const SERRATED_DIRK = "sfd-009-221"; // equipment · [Equip] [fury]
const BLOCK = "ogn-057-298"; //     spell · [Hidden] [Action] Shield 3
const BLADEKEEPER = "sfd-096-221"; // unit · 3 · Ganking

/** Shapes 1–4: P1 attacks P2's Warden at bf1; both players hold Ambush/Reaction answers. */
const attackScenario = () =>
  scenario()
    .resources(P1, { energy: 7 })
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 5, name: "Lead" }, "lead")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, INFERNA, "inf")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P1, MOBILIZE, "mobilize")
    .hand(P2, INFERNA, "inf2")
    .hand(P2, DISCIPLINE, "discipline");

async function attackOpened(): Promise<ParityPair> {
  const pair = await ParityPair.build(attackScenario);
  pair.expectParity(P1, P2);
  await pair.harness.p1.move("lead", "bf1");
  pair.server.send(P1, "standardMove", (p) => p.destination === "bf1" && JSON.stringify(p.unitIds) === JSON.stringify(["lead"]));
  return pair;
}

describe("1 · attack: standardMove into an enemy-occupied battlefield", () => {
  test("the MOVE itself stages + begins the combat showdown (isCombatShowdown, attacker/defender, focus = attacker) on both paths; nothing offers startShowdown / contest / resolve", async () => {
    const pair = await attackOpened();
    for (const st of [pair.harness.gameState, pair.server.state]) {
      const sd = st.interaction?.showdownStack ?? [];
      expect(sd).toHaveLength(1);
      expect(sd[0]).toMatchObject({
        active: true,
        attackingPlayer: P1,
        battlefieldId: "bf1",
        defendingPlayer: P2,
        focusPlayer: P1,
        isCombatShowdown: true,
        relevantPlayers: [P1, P2],
      });
      expect(st.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2, showdownComplete: false });
      expect(st.interaction?.chain?.active ?? false).toBe(false);
    }
    expect(pair.harness.state("lead").combatRole).toBe("attacker");
    expect(pair.harness.state("warden").combatRole).toBe("defender");
    const p1 = pair.expectParity(P1, P2);
    const p2 = pair.serverMenu(P2);
    for (const menu of [p1, p2]) {
      expect(has(menu, "startShowdown")).toBe(false);
      expect(has(menu, "contestBattlefield")).toBe(false);
      expect(has(menu, "resolveFullCombat")).toBe(false);
      expect(has(menu, "standardMove")).toBe(false);
    }
    expect(has(p1, "passShowdownFocus")).toBe(true);
    expect(has(p2, "passShowdownFocus")).toBe(false);
    pair.expectSamePosition();
  });
});

describe("2 · attacker's Focus: what may be played into your own attack", () => {
  test("[Ambush] Inferna is offered as playUnit to THAT battlefield only, [Action] and [Reaction] spells are offered, a standard-timing spell is not — identical on both paths", async () => {
    const pair = await attackOpened();
    const menu = pair.expectParity(P1);
    expect(playLocations(menu, "inf")).toEqual(["battlefield-bf1"]);
    expect(has(menu, "playSpell", (p) => p.cardId === "cleave")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "engarde")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "mobilize")).toBe(false);
    // The defender has nothing to do while the attacker holds Focus and no chain is open.
    expect(playLocations(pair.expectParity(P2), "inf2")).toEqual([]);

    // Playing her there works end-to-end on the SERVER path: she joins as an exhausted attacker (Assault live).
    await pair.harness.p1.play("inf", { to: "bf1" });
    pair.server.send(P1, "playUnit", (p) => p.cardId === "inf" && p.location === "battlefield-bf1");
    const after = pair.expectParity(P1, P2);
    pair.expectSamePosition();
    for (const st of [pair.harness.gameState, pair.server.state]) {
      // A permanent's play finishes at once (359.2); the combat showdown stays open and Focus moves on to
      // the defender (everyone must pass afresh).
      expect(st.interaction?.chain?.active ?? false).toBe(false);
      expect(st.interaction?.showdownStack?.[0]).toMatchObject({ focusPlayer: P2, isCombatShowdown: true, passedPlayers: [] });
    }
    expect(has(after, "passShowdownFocus")).toBe(false);
    expect(has(pair.serverMenu(P2), "passShowdownFocus")).toBe(true);
    expect(pair.harness.locationOf("inf")).toBe("bf1");
    expect(pair.harness.state("inf")).toMatchObject({ combatRole: "attacker", isExhausted: true, might: 3 });
    expect(pair.harness.p1.energy()).toBe(5);
    expect(pair.server.state.runePools[P1]?.energy).toBe(5);
  });
});

describe("3 · defender's Focus turn", () => {
  test("after the attacker passes, Focus moves to the defender who is offered their own [Ambush] unit to that battlefield and their [Reaction] spell — identical on both paths", async () => {
    const pair = await attackOpened();
    await pair.harness.p1.passFocus();
    pair.server.send(P1, "passShowdownFocus");
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.showdownStack?.[0]).toMatchObject({ focusPlayer: P2, isCombatShowdown: true, passedPlayers: [P1] });
    }
    const menu = pair.expectParity(P2);
    expect(playLocations(menu, "inf2")).toEqual(["battlefield-bf1"]);
    expect(has(menu, "playSpell", (p) => p.cardId === "discipline")).toBe(true);
    expect(has(menu, "passShowdownFocus")).toBe(true);
    expect(has(menu, "startShowdown")).toBe(false);
    // The attacker, without Focus, is offered nothing but concede.
    expect(pair.expectParity(P1).filter((m) => m.moveId !== "concede")).toEqual([]);
  });
});

describe("4 · all pass → combat resolves itself → conquer/score → back to Neutral Open", () => {
  test("the Combat Damage Step is an automatic procedure on BOTH paths (never a button): Warden dies, P1 conquers bf1 for 1 point, and a second Standard Move is legal again", async () => {
    const pair = await attackOpened();
    await pair.harness.p1.passFocus();
    pair.server.send(P1, "passShowdownFocus");
    await pair.harness.p2.passFocus();
    const closed = pair.server.send(P2, "passShowdownFocus");
    expect(closed.procedures.map((r) => r.moveId)).toEqual(["resolveFullCombat"]);

    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.showdownStack ?? []).toHaveLength(0);
      expect(st.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
      expect(st.players[P1]?.victoryPoints).toBe(1);
    }
    expect(pair.harness.zoneOf("warden")).toBe("trash");
    expect(pair.harness.state("lead")).toMatchObject({ combatRole: null, damage: 0 });
    const menu = pair.expectParity(P1, P2);
    expect(has(menu, "resolveFullCombat")).toBe(false);
    expect(has(menu, "startShowdown")).toBe(false);
    expect(has(menu, "standardMove", (p) => JSON.stringify(p.unitIds) === JSON.stringify(["scout"]))).toBe(true);
    expect(has(menu, "endTurn")).toBe(true);
    pair.expectSamePosition();
  });
});

describe("5 · move into an EMPTY uncontrolled battlefield", () => {
  test("opens a NON-combat showdown (isCombatShowdown false, mover has Focus, every player relevant), offers no stray startShowdown, and the mover conquers when everyone passes — identical on both paths", async () => {
    const pair = await ParityPair.build(attackScenario);
    await pair.harness.p1.move("scout", "bf2");
    pair.server.send(P1, "standardMove", (p) => p.destination === "bf2" && JSON.stringify(p.unitIds) === JSON.stringify(["scout"]));
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.showdownStack?.[0]).toMatchObject({
        active: true,
        battlefieldId: "bf2",
        focusPlayer: P1,
        isCombatShowdown: false,
        relevantPlayers: [P1, P2],
      });
      expect(st.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    }
    expect(pair.harness.state("scout").combatRole).toBeFalsy();
    let menu = pair.expectParity(P1, P2);
    expect(has(menu, "startShowdown")).toBe(false);
    expect(has(menu, "passShowdownFocus")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "cleave")).toBe(true); // Action window is open
    expect(has(menu, "playSpell", (p) => p.cardId === "mobilize")).toBe(false);

    await pair.harness.p1.passFocus();
    pair.server.send(P1, "passShowdownFocus");
    menu = pair.expectParity(P2, P1);
    expect(has(menu, "passShowdownFocus")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "discipline")).toBe(true);

    await pair.harness.p2.passFocus();
    const closed = pair.server.send(P2, "passShowdownFocus");
    expect(closed.procedures).toEqual([]); // nothing to resolve: no combat
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.showdownStack ?? []).toHaveLength(0);
      expect(st.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
      expect(st.players[P1]?.victoryPoints).toBe(1);
    }
    pair.expectParity(P1, P2);
    pair.expectSamePosition();
  });
});

describe("6 · activated abilities mid main phase", () => {
  const abilityScenario = () =>
    scenario()
      .resources(P1, { energy: 3, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .legend(P1, BLIND_MONK, "monk")
      .unit(P1, "base", SHADOW_FIEND, "fiend")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, RAVENBORN_TOME, "tome")
      .gear(P1, SERRATED_DIRK, "dirk");

  test("Shadow Fiend's Empower ([2][fury]), the legend's [1]+[Exhaust] ability, a gear's [Exhaust] ability and [Equip] are all offered on both paths; using Empower keeps the paths in lock-step", async () => {
    const pair = await ParityPair.build(abilityScenario);
    const menu = pair.expectParity(P1, P2);
    expect(has(menu, "activateAbility", (p) => p.cardId === "fiend")).toBe(true);
    expect(has(menu, "activateAbility", (p) => p.cardId === "monk")).toBe(true);
    expect(has(menu, "activateAbility", (p) => p.cardId === "tome")).toBe(true);
    expect(has(menu, "equipCard", (p) => p.equipmentId === "dirk" && p.unitId === "squire")).toBe(true);

    await pair.harness.p1.activate("fiend");
    pair.server.send(P1, "activateAbility", (p) => p.cardId === "fiend");
    pair.expectParity(P1, P2);
    pair.expectSamePosition();
    await pair.harness.settle();
    pair.server.settlePassive();
    pair.expectParity(P1, P2);
    pair.expectSamePosition();
    expect(pair.harness.state("fiend").keywords).toContain("Assault");
    expect(pair.harness.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(has(pair.serverMenu(P1), "activateAbility", (p) => p.cardId === "fiend")).toBe(false); // "only if not Empowered"
  });
});

describe("7 · Hidden: hide now, reveal on a later turn", () => {
  test("hideCard is offered at a controlled battlefield on both paths; after a full turn cycle revealHidden is offered on both", async () => {
    const hiddenScenario = () =>
      scenario()
        .resources(P1, { energy: 2, power: { calm: 1 } })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
        .hand(P1, BLOCK, "block");
    const pair = await ParityPair.build(hiddenScenario);
    let menu = pair.expectParity(P1, P2);
    expect(has(menu, "hideCard", (p) => p.cardId === "block" && p.battlefieldId === "bf1")).toBe(true);

    await pair.harness.p1.hide("block", "bf1");
    pair.server.send(P1, "hideCard", (p) => p.cardId === "block" && p.battlefieldId === "bf1");
    menu = pair.expectParity(P1, P2);
    expect(has(menu, "revealHidden", (p) => p.cardId === "block")).toBe(false); // not the turn it was hidden
    expect(pair.harness.zoneOf("block")).toBe("facedown-bf1");

    // P1 → P2 → P1 (P2's turn is passed straight through on both paths).
    await pair.harness.advanceTurn();
    pair.server.do(P1, "endTurn");
    pair.server.settlePassive();
    pair.expectParity(P1, P2);
    await pair.harness.advanceTurn();
    pair.server.do(P2, "endTurn");
    pair.server.settlePassive();
    expect(pair.harness.turnPlayer()).toBe(P1);
    expect(pair.server.state.turn).toEqual(pair.harness.gameState.turn);
    menu = pair.expectParity(P1, P2);
    expect(has(menu, "revealHidden", (p) => p.cardId === "block")).toBe(true);
    pair.expectSamePosition();
  });
});

describe("8 · Ganking battlefield → battlefield", () => {
  test("a Ganking unit at bf1 is offered the bf1→bf2 leg (gankingMove and the Standard Move variant) on both paths; taking it opens the showdown at bf2 identically", async () => {
    const gankScenario = () =>
      scenario()
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: P2 })
        .unit(P1, "bf1", BLADEKEEPER, "keeper")
        .unit(P2, "bf2", { might: 1, name: "Picket" }, "picket");
    const pair = await ParityPair.build(gankScenario);
    const menu = pair.expectParity(P1, P2);
    expect(has(menu, "gankingMove", (p) => p.unitId === "keeper" && p.toBattlefield === "bf2")).toBe(true);
    expect(has(menu, "standardMove", (p) => p.destination === "bf2" && JSON.stringify(p.unitIds) === JSON.stringify(["keeper"]))).toBe(true);

    await pair.harness.p1.gank("keeper", "bf2");
    pair.server.send(P1, "gankingMove", (p) => p.unitId === "keeper" && p.toBattlefield === "bf2");
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.showdownStack?.[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    }
    expect(has(pair.expectParity(P1, P2), "startShowdown")).toBe(false);
    pair.expectSamePosition();
  });
});

describe("9 · chain: play a spell → priority passes → pass/pass resolves", () => {
  test("menus match at every priority hand-off; the spell resolves on the second pass on both paths", async () => {
    const chainScenario = () =>
      scenario()
        .resources(P1, { energy: 3 })
        .resources(P2, { energy: 2 })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 2, name: "Duelist" }, "duelist")
        .hand(P1, CLEAVE, "cleave")
        .hand(P1, EN_GARDE, "engarde")
        .hand(P2, DISCIPLINE, "discipline")
        .hand(P2, MOBILIZE, "mobilize2");
    const pair = await ParityPair.build(chainScenario);
    pair.expectParity(P1, P2);

    await pair.harness.p1.cast("cleave", { targets: "duelist" });
    pair.server.send(P1, "playSpell", (p) => p.cardId === "cleave");
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.chain).toMatchObject({ active: true, activePlayer: P1 });
      expect(st.interaction?.chain?.items.map((i) => i.cardId)).toEqual(["cleave"]);
    }
    let menu = pair.expectParity(P1, P2);
    expect(has(menu, "passChainPriority")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "engarde")).toBe(true); // Reaction on top of own spell
    expect(has(pair.serverMenu(P2), "passChainPriority")).toBe(false);

    await pair.harness.p1.passPriority();
    pair.server.send(P1, "passChainPriority");
    menu = pair.expectParity(P2, P1);
    expect(has(menu, "passChainPriority")).toBe(true);
    expect(has(menu, "playSpell", (p) => p.cardId === "discipline")).toBe(true); // Reaction: yes
    expect(has(menu, "playSpell", (p) => p.cardId === "mobilize2")).toBe(false); // standard timing: no

    await pair.harness.p2.passPriority();
    const resolved = pair.server.send(P2, "passChainPriority");
    expect(resolved.success).toBe(true);
    for (const st of [pair.harness.gameState, pair.server.state]) {
      expect(st.interaction?.chain?.active ?? false).toBe(false);
    }
    expect(pair.harness.zoneOf("cleave")).toBe("trash");
    expect(pair.harness.state("duelist").keywords).toContain("Assault");
    pair.expectParity(P1, P2);
    pair.expectSamePosition();
  });
});

describe("10 · end turn → second seat's turn (Goldfish) → back to P1", () => {
  test("the server's Goldfish policy over applyMove and the harness's passive advanceTurn land P1 in the same next main phase with the same menu", async () => {
    const cycleScenario = () =>
      scenario()
        .resources(P1, { energy: 2 })
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: null })
        .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
        .unit(P1, "base", { might: 3, name: "Reserve" }, "reserve", { exhausted: true })
        .unit(P2, "base", { might: 2, name: "Idler" }, "idler")
        .hand(P1, CLEAVE, "cleave")
        .hand(P2, DISCIPLINE, "discipline");
    const pair = await ParityPair.build(cycleScenario);
    const turnBefore = pair.harness.turnNumber();
    pair.expectParity(P1, P2);

    // Harness: P1 ends turn, P2's turn is settled passively and ended, P1's start-of-turn settles.
    await pair.harness.advanceTurn();
    expect(pair.harness.turnPlayer()).toBe(P2);
    await pair.harness.advanceTurn();
    // Server: the human's endTurn over the wire, then sandboxAutoPlay(goldfish = P2), then P1's client passes
    // whatever start-of-turn priority it is handed (nothing scripted here).
    pair.server.do(P1, "endTurn");
    pair.server.goldfish(P2);
    pair.server.settlePassive();

    expect(pair.harness.turnPlayer()).toBe(P1);
    expect(pair.harness.phase()).toBe("main");
    expect(pair.harness.turnNumber()).toBe(turnBefore + 2);
    expect(pair.server.state.turn).toEqual(pair.harness.gameState.turn);
    const menu = pair.expectParity(P1, P2);
    // Hold scored at P1's Beginning Phase; units readied; pool refilled by channeling.
    expect(pair.harness.p1.points()).toBe(1);
    expect(pair.server.state.players[P1]?.victoryPoints).toBe(1);
    expect(pair.harness.state("reserve").isExhausted).toBe(false);
    expect(has(menu, "standardMove", (p) => JSON.stringify(p.unitIds) === JSON.stringify(["reserve"]))).toBe(true);
    expect(has(menu, "endTurn")).toBe(true);
    pair.expectSamePosition();
  });
});
