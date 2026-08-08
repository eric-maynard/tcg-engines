/**
 * Chakram Dancer — unl-071-219 · Unit · Mind · 3 energy (no power) · 3 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play me, give your other units here [Shield] this turn. (+1 [Might] while they're defenders.)
 *
 * Rules: 822 (Ambush ≡ "I may be played to a battlefield where you control units" + "I have Reaction
 * while being played there"; 813 Reaction timing = closed states / showdowns on ANY turn — never the
 * base at Reaction speed, nothing at all with no unit at any battlefield), 323.2.a (a unit arriving
 * mid-combat takes its controller's designation), 143.4 (still enters exhausted), 383.4.a (the play
 * effect is a chain item), 814 (Shield ≡ +1 Might WHILE A DEFENDER; values from several sources sum,
 * 814.2), 432.1.a ("this turn").
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The real use: Ambush in as a Reaction while your battlefield is under attack → every OTHER
 *     friendly unit there defends at +1 (raises both their damage and their lethal threshold), the
 *     Dancer itself does not, and units in base / elsewhere are not "here".
 *  2. Played to BASE on your own turn "here" is the base: base units get the (useless there) Shield,
 *     battlefield units do not. Ambushed into your own ATTACK the grant happens but is worth +0.
 *  3. Shield stacks (814.2): Blue Sentinel [Shield 2] defending beside an ambushed Dancer is 4+2+1 = 7.
 *  4. Expiry: granted during the opponent's turn, gone when that turn ends.
 *  5. Ambush limits: at Reaction speed every battlefield where you already have a unit is offered —
 *     even one away from the fight — but never base and never an EMPTY battlefield you control; with
 *     units only in base it is unplayable off-turn; in the opponent's neutral open state the
 *     Dancer is not playable at all; as a Reaction to a spell it lands before the spell resolves.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-071-219";
const BLUE_SENTINEL = "unl-087-219"; // Mind 4: [Shield 2] …
const CLEAVE = "ogn-004-298"; // Fury [Action] 1: give a unit Assault 3 this turn (P2's chain opener)

const shieldGrant = { duration: "turn", keyword: "Shield" };
const destinations = (game: Game) => (game.p1.option("playUnit", "cd")?.variants.map((v) => v.params.location as string) ?? []).sort();

/** P2 attacks P1's bf1 (two 2-Might Guards) with a `raider`-Might unit; P1 has 3 energy and the Dancer in hand. */
function underAttack(raider: number) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard One" }, "g1")
    .unit(P1, "bf1", { might: 2, name: "Guard Two" }, "g2")
    .unit(P1, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P2, "base", { might: raider, name: "Raider" }, "raider")
    .hand(P1, CARD, "cd");
}

describe("Chakram Dancer (unl-071-219)", () => {
  test("cost: 3 energy, no power; played to base on your turn it enters exhausted as a 3-Might Ambush unit; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "cd").build();
    expect(destinations(game)).toEqual(["base"]); // no unit at any battlefield → Ambush adds nothing
    await game.p1.play("cd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("cd")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3, zone: "base" });
    expect(game.state("cd").keywords).toContain("Ambush");
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 3 } }).hand(P1, CARD, "x").build()).p1.can("play", "x")).toBe(false);
  });

  test("'your OTHER units here' — played with no other friendly unit here the effect does nothing (the Dancer itself is never a recipient)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "cd").build();
    await game.p1.play("cd");
    await game.settle();
    expect(game.zoneOf("cd")).toBe("base");
    expect(game.state("cd").grantedKeywords).toEqual([]);
  });

  test("When you play me (to base): the play effect is a chain item; on resolution your OTHER units in BASE get [Shield] this turn, battlefield units and the Dancer do not; it lapses next turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P1, "bf1", { might: 2, name: "Far Guard" }, "far")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "cd")
      .build();
    expect(destinations(game)).toEqual(["base", "battlefield-bf1"]); // own turn: base OR the battlefield where you have a unit
    await game.p1.play("cd", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cd", controller: P1, triggered: true })]);
    expect(game.state("home").grantedKeywords).toEqual([]);
    await game.settle();
    expect(game.state("home").grantedKeywords).toEqual([shieldGrant]);
    expect(game.state("home").might).toBe(2); // not a defender → +0 right now
    expect(game.state("far").grantedKeywords).toEqual([]);
    expect(game.state("cd").grantedKeywords).toEqual([]);
    expect(game.state("foe").grantedKeywords).toEqual([]);
    await game.advanceTurn();
    expect(game.state("home").grantedKeywords).toEqual([]);
  });

  test("Ambush under attack (opponent's turn): with Focus P1 may play it to a battlefield where P1 has units (bf1 or bf2 — never base); into bf1 it joins as an exhausted DEFENDER, the play effect waits on the chain (P1 then P2 pass, 337.4), then both Guards defend at 3 (Dancer stays 3, base/bf2 units get nothing)", async () => {
    const game = await underAttack(5).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1", "battlefield-bf2"]); // 822.1.b: any battlefield where you have units
    await game.p1.play("cd", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("cd")).toMatchObject({ combatRole: "defender", isExhausted: true, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cd", triggered: true })]);
    expect(game.state("g1")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // the opponent may still respond
    await game.p2.passPriority();
    expect(game.state("g1")).toMatchObject({ combatRole: "defender", grantedKeywords: [shieldGrant], might: 3 });
    expect(game.state("g2")).toMatchObject({ grantedKeywords: [shieldGrant], might: 3 });
    expect(game.state("cd")).toMatchObject({ grantedKeywords: [], might: 3 });
    expect(game.state("far").grantedKeywords).toEqual([]);
    expect(game.state("home").grantedKeywords).toEqual([]);
  });

  test("…and it decides the combat: 3+3+3 = 9 kills the 5-Might Raider; its 5 damage now buys only ONE 3-Might Guard (3) with 2 wasted — splitting 2/2/1 across the old 2-Might bodies is refused", async () => {
    const game = await underAttack(5).autoProcedures(false).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("cd", { to: "bf1" });
    await game.settle(); // priorities + focus passes; combat is a manual procedure here
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    expect((await game.p2.try((p) => p.distribute({ cd: 1, g1: 2, g2: 2 }))).ok).toBe(false);
    await game.p2.distribute({ g1: 2, g2: 3 });
    while (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.state("g1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("cd")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    // "this turn": the survivors lose Shield when P2's turn ends.
    await game.p2.endTurn();
    expect(game.state("g1").grantedKeywords).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: WITHOUT the Dancer the same 5-Might Raider kills both 2-Might Guards (and dies to 4) — the battlefield is emptied", async () => {
    const game = await underAttack(5).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
  });

  test("814.2 stacking — Blue Sentinel [Shield 2] defends at 6; an ambushed Dancer makes it 7, so a 6-Might Raider no longer kills it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", BLUE_SENTINEL, "blue")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .hand(P1, CARD, "cd")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("blue")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.p2.passFocus();
    await game.p1.play("cd", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("blue").might).toBe(7);
    expect(game.state("blue").grantedKeywords).toContainEqual(shieldGrant);
    await game.settle();
    expect(game.zoneOf("blue")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 7 + 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Shield is defender-only: ambushed into your OWN attack the other attacker gets the keyword but fights at its printed 2 — 2+3 = 5 still can't crack a 6-Might Warden", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 2, name: "Lead" }, "lead")
      .hand(P1, CARD, "cd")
      .build();
    await game.p1.move("lead", "bf1");
    expect(destinations(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("cd", { to: "bf1" });
    expect(game.state("cd").combatRole).toBe("attacker");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("lead")).toMatchObject({ combatRole: "attacker", grantedKeywords: [shieldGrant], might: 2 });
    await game.settle();
    expect(game.locationOf("warden")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("Ambush as a true Reaction to a spell on P2's turn: playable only to the battlefield where P1 has a unit, resolves (unit + Shield) before the spell does", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 }) // controlled but empty
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "cd")
      .build();
    await game.p2.cast("cleave", { targets: "pupil" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1"]); // never base, never empty bf2
    await game.p1.play("cd", { to: "bf1" });
    expect(game.locationOf("cd")).toBe("bf1");
    expect(game.zoneOf("cleave")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "cd"]); // play effect on top of the spell
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("guard").grantedKeywords).toEqual([shieldGrant]);
    expect(game.state("home").grantedKeywords).toEqual([]);
    expect(game.state("cd").isExhausted).toBe(true);
  });

  test("negative space — Ambush needs 'a battlefield where you have units' and Reaction timing: with units only in base P1 cannot react with it; and in P2's neutral OPEN main phase it is not offered even with a Guard on bf1", async () => {
    const noUnits = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "cd")
      .build();
    await noUnits.p2.cast("cleave", { targets: "pupil" });
    await noUnits.p2.passPriority();
    expect(noUnits.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(noUnits.p1.can("play", "cd")).toBe(false);

    const open = await scenario().active(P2).resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "guard").hand(P1, CARD, "cd").build();
    expect(open.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(open.p1.can("play", "cd")).toBe(false);
  });

  test("registry payload matches the printed text: Ambush keyword + play-self trigger granting Shield (this turn) to OTHER FRIENDLY units HERE; 3 energy, no power, 3 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3, name: "Chakram Dancer" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      {
        effect: {
          duration: "turn",
          keyword: "Shield",
          target: { controller: "friendly", excludeSelf: true, location: "here", quantity: "all", type: "unit" },
          type: "grant-keyword",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});
