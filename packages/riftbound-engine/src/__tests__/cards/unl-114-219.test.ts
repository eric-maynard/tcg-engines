/**
 * Nidalee, Cat Form — unl-114-219 · Champion Unit (Nidalee) · Body · 3 energy + [body] · 4 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When I win a combat, draw 1. (I win if I remain after combat.)
 *
 * Rules: 822 (Ambush = "may be played to a battlefield where you control units" + "[Reaction] while
 * being played there"; base is NOT an Ambush destination at Reaction speed), 466.3.a/c (a unit wins a
 * combat when its side is the only one with units left at that battlefield in the result step),
 * 466.3.d (attackers recalled because defenders survived = No Result — nobody won), 466.1.a.2.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "I win if I remain": Nidalee must herself still be at the battlefield in the result step. If she
 *     dies but her side conquers anyway, SHE did not win → no draw. If an ally dies and she remains → draw.
 *  2. No Result is not a win: attacking into a wall that survives (stunned, deals nothing) recalls her
 *     to base — she "remains" on the board but not at the battlefield; 466.3.d says nobody won.
 *  3. Defending counts: on the opponent's turn, if the attackers all die and she is still there, draw 1.
 *  4. Ambush INTO your own attack: with allies already attacking bf1 she may be played there at Reaction
 *     speed during the showdown, joins as an attacker (exhausted units still deal combat damage), and if
 *     the attack wipes the defenders she wins that very combat → draw.
 *  5. Ambush as a surprise DEFENDER: P2 attacks a battlefield where P1 has a unit; P1 reacts with
 *     Nidalee there; she is a defender; defenders hold → she wins → draw on P2's turn.
 *  6. Negative space: walking onto an EMPTY enemy battlefield is a conquer but not a combat → no draw;
 *     at Reaction speed she cannot be played to base nor to a battlefield with no friendly unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-114-219";

function attacking(defender: { might: number; stunned?: boolean }, extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defender.might, name: "Foe" }, "foe", defender.stunned ? { stunned: true } : undefined)
    .unit(P1, "base", CARD, "nid");
  extra?.(b);
  return b;
}

describe("Nidalee, Cat Form (unl-114-219)", () => {
  test("registry payload matches the printed text: Ambush keyword + a self win-combat trigger that draws 1; 3 energy + [body], 4 Might champion", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 3, isChampion: true, might: 4, name: "Nidalee, Cat Form" });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      { effect: { amount: 1, type: "draw" }, trigger: { event: "win-combat", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 3 energy + exactly one body power; enters base exhausted at 4 Might with Ambush; 2 energy or off-domain power cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "nid").build();
    await game.p1.play("nid");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("nid")).toBe("base");
    expect(game.state("nid")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("nid").keywords).toContain("Ambush");
    expect(game.p1.hand()).toEqual([]); // playing her draws nothing
    expect((await scenario().resources(P1, { energy: 2, power: { body: 1 } }).hand(P1, CARD, "nid").build()).p1.can("play", "nid")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "nid").build()).p1.can("play", "nid")).toBe(false);
  });

  test("wins a combat as the lone attacker (4 vs 3): defender dies, she remains, conquers, and P1 draws exactly 1", async () => {
    const game = await attacking({ might: 3 }).build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.move("nid", "bf1");
    expect(game.state("nid").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("loses the combat (4 vs 5): she dies → no draw", async () => {
    const game = await attacking({ might: 5 }).build();
    await game.p1.move("nid", "bf1");
    await game.settle();
    expect(game.zoneOf("nid")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("466.3.d No Result is not a win: into a stunned 5-Might wall both survive, she is recalled to base, nobody draws", async () => {
    const game = await attacking({ might: 5, stunned: true }).build();
    await game.p1.move("nid", "bf1");
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.locationOf("nid")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("a mutual kill (4 vs 4) leaves nobody at the battlefield: she did not remain → no draw", async () => {
    const game = await attacking({ might: 4 }).build();
    await game.p1.move("nid", "bf1");
    await game.settle();
    expect(game.zoneOf("nid")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("defending counts too: on P2's turn a 3-Might raider dies against her, she remains → P1 draws 1 (P2 draws nothing)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "nid")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("nid").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("'I win if I remain': an ally dies to the defender's damage but Nidalee survives and the defender falls → exactly one draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", CARD, "nid")
      .build();
    // The defender (2 Might) assigns its 2 damage; P2 puts it all on the ally (lethal 2 — legal per 465.2.c.3).
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { pal: 2 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["pal", "nid"], "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("the DEFENDING player's chosen combat-damage assignment (465.2.c / 465.2.c.3: {pal:2} is a legal line) is honoured by the resolver", async () => {
    // Same fight as above but the attackers arrive in the order [nid, pal], so the engine's greedy default
    // is {nid:2}. P2 explicitly answers {pal:2}; expected: pal dies, Nidalee remains and draws 1.
    // Actual: resolveCombat() only honours the attacker's assignment; pal survives undamaged.
    const game = await attacking({ might: 2 }, (b) => b.unit(P1, "base", { might: 2, name: "Pal" }, "pal")).build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { pal: 2 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["nid", "pal"], "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("pal")).toBe("trash");
  });

  test("negative space of 'remain': Nidalee dies to the defender's damage while her ally survives and conquers → her side won but SHE draws nothing", async () => {
    const game = await attacking({ might: 4 }, (b) => b.unit(P1, "base", { might: 2, name: "Pal" }, "pal")).build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { nid: 4 }, kind: "distribute" } : undefined)]);
    await game.p1.move(["nid", "pal"], "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 4+2 = 6 ≥ 4
    expect(game.zoneOf("nid")).toBe("trash");
    expect(game.locationOf("pal")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("conquering an EMPTY enemy battlefield is not a combat: 1 point, no draw", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "nid").build();
    await game.p1.move("nid", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("Ambush INTO your own attack: during the showdown she is offered only bf1 (where the ally is), joins as an exhausted attacker, 2+4 wipes a 5-Might defender, she remains → draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "nid")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.option("playUnit", "nid")?.variants.map((v) => v.params.location)).toEqual(["battlefield-bf1"]);
    await game.p1.play("nid", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("nid")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1", might: 4 });
    // Warden's 5: lethal 2 on the scout first, the remaining 3 on Nidalee (465.2.c.3) — she survives at 4 Might.
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { nid: 3, scout: 2 }, kind: "distribute" } : undefined)]);
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1); // Nidalee left the hand, one card drawn
    expect(game.p1.hand()).not.toContain("nid");
  });

  test("Ambush as a surprise DEFENDER on P2's turn: played to the attacked battlefield after P2 passes focus; 2+4 defenders kill the 5-Might raider, she remains → P1 draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "nid")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("play", "nid")).toBe(true);
    expect(game.p1.option("playUnit", "nid")?.variants.map((v) => v.params.location)).toEqual(["battlefield-bf1"]);
    await game.p1.play("nid", { to: "bf1" });
    expect(game.state("nid").combatRole).toBe("defender");
    // The raider (attacker) assigns 5: lethal 2 on the guard first, the remaining 3 on Nidalee.
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { guard: 2, nid: 3 }, kind: "distribute" } : undefined)]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("nid")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.hand()).not.toContain("nid");
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("Ambush limits (822.1.b): on P2's turn with P1's only unit in base she cannot be played at all — base is not an Ambush destination and bf1 has no friendly unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { body: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P2, "base", { might: 2 }, "pupil")
      .hand(P2, "ogn-058-298", "discipline") // a Reaction spell to open a chain
      .hand(P1, CARD, "nid")
      .build();
    await game.p2.cast("discipline", { targets: "pupil" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "nid")).toBe(false);
    // …whereas on her own open turn (no controlled battlefield, no unit anywhere) she plays to base like any unit.
    const own = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "nid").build();
    expect(own.p1.option("playUnit", "nid")?.variants.map((v) => v.params.location)).toEqual(["base"]);
  });

  test("Ambush on your own open turn adds a destination: a battlefield you do NOT control but where you have a unit is offered alongside base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .hand(P1, CARD, "nid")
      .build();
    expect(game.p1.option("playUnit", "nid")?.variants.map((v) => v.params.location)).toEqual(["base"]);
    await game.p1.move("scout", "bf1"); // now P1 has a unit at bf1 (a showdown opens; she has Reaction there)
    expect([...(game.p1.option("playUnit", "nid")?.variants.map((v) => v.params.location as string) ?? [])].sort()).toEqual(["battlefield-bf1"]);
  });
});
