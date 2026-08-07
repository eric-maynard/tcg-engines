/**
 * Vex, Mocking — unl-055-219 · Unit (Champion, Vex) · Calm · 5 energy + [calm] · 5 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *   When you [Stun] an enemy unit at a battlefield, you may move me to that battlefield.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. The trigger subject is "an ENEMY unit AT A BATTLEFIELD" and the actor is YOU: an enemy in a
 *      base, a friendly unit anywhere, an already-stunned enemy (423.1.a.1: no stun happens), and any
 *      stun performed by the opponent (even on their own unit at a battlefield) must all be silent.
 *   2. "that battlefield" is the stunned unit's battlefield (359.3.f.3 "there"), not Vex's own spot;
 *      the move is an effect-move: no exhaust needed/paid, base→bf or bf→bf, and arriving at an
 *      enemy-held battlefield on your turn contests it and starts a combat (450) in which the freshly
 *      stunned defender deals nothing (423.1.b).
 *   3. "you may": a yes/no owned by P1; declining changes nothing.
 *   4. Defensive line: on the opponent's turn, with Focus in their combat showdown, Back Off the
 *      attacker → Vex drops in as a DEFENDER: Shield makes her 6 and Tank soaks first (814/815).
 *   5. Shield only while defending (814.1.c); Tank forces lethal-first assignment onto her (815.1.b).
 *   Partners used: Back Off (unl-042-219, "Stun a unit", 3) and Rune Prison (ogn-050-298, 2+[calm]).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-055-219";
const BACK_OFF = "unl-042-219"; // [Action] Stun a unit. If played from hand, draw 1. (3)
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit. (2 + [calm])

/** P1 to act: Vex (exhausted) in base, Back Off in hand, P2 holds bf1 with a 5-Might unit and has a Homebody. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", CARD, "vex", { exhausted: true })
    .unit(P1, "bf2", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, BACK_OFF, "bo");
}

/** Pass priority for whoever holds it and answer P1's "you may" with `accept`; returns the prompt count. */
async function resolveStun(game: Game, accept: boolean): Promise<number> {
  let prompts = 0;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      prompts += 1;
      await (accept ? game.p1.yes() : game.p1.no());
    } else if (d?.kind === "pick" && d.seat === P1 && d.options.length === 1) {
      await game.p1.pick(d.options[0]!.key); // forced single target/destination
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return prompts;
}

describe("Vex, Mocking (unl-055-219)", () => {
  test("costs 5 energy + [calm]; enters the base exhausted as a 5-Might unit with Shield and Tank; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "vex").build();
    await game.p1.play("vex");
    await game.settle();
    expect(game.zoneOf("vex")).toBe("base");
    expect(game.state("vex")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    expect(game.state("vex").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "vex").build()).p1.can("play", "vex")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "vex").build()).p1.can("play", "vex")).toBe(false);
  });

  test("[Shield]: defending alone she is 6 — a 5-Might attacker dies (took 6) and Vex survives (5 < 6), healed afterwards", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "vex").unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    expect(game.state("vex").combatRole).toBe("defender");
    expect(game.state("vex").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.state("vex")).toMatchObject({ damage: 0, might: 5 }); // Shield gone with the designation
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Shield] does not apply while attacking: Vex (5) into a 5-Might defender → both die", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "vex").unit(P2, "bf1", { might: 5 }, "def").build();
    await game.p1.move("vex", "bf1");
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.state("vex").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("vex")).toBe("trash");
  });

  test("[Tank]: a 4-Might raider into a 2-Might Pal + Vex must put all 4 on Vex (6 as defender) — nobody on P1's side dies; without Vex's Tank the Pal would", async () => {
    const control = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Pal" }, "pal").unit(P1, "bf1", { might: 5, name: "Big" }, "big").unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    await control.p2.move("raider", "bf1");
    await control.settle();
    expect(control.zoneOf("pal")).toBe("trash"); // first-listed 2-Might unit eats lethal

    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Pal" }, "pal").unit(P1, "bf1", CARD, "vex").unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1"); // 4 < 6
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: [Tank] assignment legality (815.1.c): a 7-Might raider into Pal + Pal2 + Vex must give Vex her lethal 6 first — {pal:1, pal2:1, vex:5} and {pal:2, pal2:5} refused; {vex:6, pal2:1} legal → Vex dies, both Pals hold", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "bf1", { might: 2, name: "Pal2" }, "pal2")
      .unit(P1, "bf1", CARD, "vex")
      .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    expect((await game.p2.try((p) => p.distribute({ pal: 1, pal2: 1, vex: 5 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ pal: 2, pal2: 5 }))).ok).toBe(false);
    await game.p2.distribute({ pal2: 1, vex: 6 });
    if (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.zoneOf("pal2")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 2 + 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("stunning an enemy unit at a battlefield (Back Off on Defender) asks P1 'you may move me' — yes → exhausted Vex lands at bf1, contests it, and the stunned 5 dies to her 5 → conquer", async () => {
    // Expected: after Back Off resolves a P1 yes/no appears; accepting moves Vex base→bf1 without readying
    // her; the ensuing combat kills the stunned Defender (deals 0, takes 5) and P1 conquers bf1 (+1 point).
    // Actual: the stun event never matches the trigger (location:"battlefield" reads a `to` field the stun
    // event doesn't carry), so no prompt appears and Vex never moves.
    const game = await board().build();
    await game.p1.cast("bo", { targets: "def" });
    expect(await resolveStun(game, true)).toBe(1);
    expect(game.state("def").isStunned).toBe(true);
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.state("vex").isExhausted).toBe(true); // moved, not Moved-as-an-action
    await game.settle(); // combat at bf1
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.state("vex").damage).toBe(0);
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'you may' — declining the prompt leaves Vex in base and no combat happens", async () => {
    // Expected: exactly one yes/no for P1; answering no keeps Vex home. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.cast("bo", { targets: "def" });
    expect(await resolveStun(game, false)).toBe(1);
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    expect(game.locationOf("vex")).toBe("base");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  });

  test("bf→bf — Vex sitting at bf2 hops straight to the stunned unit's battlefield ('that battlefield' = there, 359.3.f.3), Pal stays", async () => {
    // Expected: Vex bf2 → bf1 (no Ganking needed for an effect-move), Pal untouched. Actual: no trigger.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", CARD, "vex")
      .unit(P1, "bf2", { might: 2, name: "Pal" }, "pal")
      .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(await resolveStun(game, true)).toBe(1);
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.state("vex").isReady).toBe(true); // a ready Vex stays ready: no Standard Move cost
    expect(game.locationOf("pal")).toBe("bf2");
  });

  test("defensive drop-in — on P2's turn, Back Off their attacker with Focus → Vex joins bf1 as a DEFENDER (Shield → 6, Tank); the stunned 7-Might Raider deals 0 and dies to 3+6", async () => {
    // Expected: one prompt, Vex at bf1 with combatRole defender and 6 Might; after combat Holder and Vex are
    // unhurt, the 7-Might Raider (took 3+6=9) dies. Actual: no prompt; Holder alone takes the fight.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", CARD, "vex", { exhausted: true })
      .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
      .hand(P1, BACK_OFF, "bo")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("bo", { targets: "raider" });
    expect(await resolveStun(game, true)).toBe(1);
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.state("vex")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: stunning an enemy unit in its BASE, or a FRIENDLY unit at a battlefield, never asks and never moves Vex", async () => {
    const inBase = await board().build();
    await inBase.p1.cast("bo", { targets: "home" });
    expect(await resolveStun(inBase, true)).toBe(0);
    await inBase.settle();
    expect(inBase.state("home").isStunned).toBe(true);
    expect(inBase.locationOf("vex")).toBe("base");

    const friendly = await board().build();
    await friendly.p1.cast("bo", { targets: "pal" });
    expect(await resolveStun(friendly, true)).toBe(0);
    await friendly.settle();
    expect(friendly.state("pal").isStunned).toBe(true);
    expect(friendly.locationOf("vex")).toBe("base");
  });

  test("negative space: an ALREADY-stunned enemy at a battlefield is not stunned again (423.1.a.1) → no prompt, Vex stays", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Dazed" }, "dazed", { stunned: true }).build();
    await game.p1.cast("bo", { targets: "dazed" });
    expect(await resolveStun(game, true)).toBe(0);
    await game.settle();
    expect(game.locationOf("vex")).toBe("base");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  });

  test("'when YOU stun': the opponent stunning a unit at a battlefield — mine or their own — gives me no prompt and Vex stays put", async () => {
    for (const target of ["pal", "def"]) {
      const game = await board().active(P2).resources(P2, { energy: 3 }).hand(P2, BACK_OFF, "theirs").build();
      await game.p2.cast("theirs", { targets: target });
      expect(await resolveStun(game, true)).toBe(0);
      await game.settle();
      expect(game.state(target).isStunned).toBe(true);
      expect(game.locationOf("vex")).toBe("base");
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    }
  });

  test("works only from the board: with Vex still in HAND, stunning an enemy at a battlefield prompts nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "def")
      .hand(P1, CARD, "vex")
      .hand(P1, BACK_OFF, "bo")
      .build();
    await game.p1.cast("bo", { targets: "def" });
    expect(await resolveStun(game, true)).toBe(0);
    await game.settle();
    expect(game.zoneOf("vex")).toBe("hand");
  });

  test("registry payload — Shield 1, Tank, and an OPTIONAL stun trigger (enemy unit at a battlefield) that moves SELF to THAT battlefield, not 'here'", async () => {
    // Expected: move destination = the trigger's battlefield ("there"-style referent). Actual: `to: "here"`,
    // which the move handler reads as Vex's own current zone — a no-op even once the trigger fires.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, isChampion: true, might: 5, name: "Vex, Mocking" });
    expect(def?.powerCost).toEqual(["calm"]);
    expect(def?.tags).toEqual(["Vex"]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toEqual({ keyword: "Shield", type: "keyword", value: 1 });
    expect(abilities[1]).toEqual({ keyword: "Tank", type: "keyword" });
    expect(abilities[2]).toMatchObject({
      optional: true,
      trigger: { event: "stun", on: { cardType: "unit", controller: "enemy", location: "battlefield" } },
      type: "triggered",
    });
    const effect = abilities[2]?.effect as { type?: string; target?: unknown; to?: string };
    expect(effect).toMatchObject({ target: "self", type: "move" });
    expect(effect.to).not.toMatch(/^(here|base|choose)$/);
  });
});
