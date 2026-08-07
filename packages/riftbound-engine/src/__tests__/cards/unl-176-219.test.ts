/**
 * Vi, Peacekeeper — unl-176-219 · Champion Unit · Order · 5 energy + [order] · 5 Might · Vi
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When I attack, [Stun] an enemy unit here. (It doesn't deal combat damage this turn.)
 *
 * Rules: 822.1.b (Ambush = "may be played to a battlefield where you control units" + "[Reaction]
 * while being played there"), 813 (Reaction timing: a chain you hold priority on, or a showdown
 * you hold Focus in — never the opponent's Neutral Open state), 419.1.a (cards are played from hand
 * OR the Champion Zone), 355.2.a (default locations: base or a battlefield you control), 143.4
 * (units enter exhausted — an ambusher still defends), 383.4.e.1 ("When I attack" = on gaining the
 * Attacker designation, including a unit that joins an attack in progress), 423.1 (stunned: no
 * combat damage dealt, still takes damage, cleared at end of turn), 466 (attackers that do not
 * clear the defenders are recalled), 359.3.f.4 ("enemy … here" read from the trigger's battlefield).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Ambush windows: on the opponent's turn only once I hold Focus/priority; destination must be a
 *     battlefield where I HAVE units (a controlled-but-empty one and the base are not Ambush
 *     destinations at Reaction speed).
 *  2. Ambushed in as a DEFENDER she enters exhausted, fights, and her attack trigger must NOT fire.
 *  3. Ambushed into MY OWN attack (my showdown) she gains the Attacker designation → trigger fires.
 *  4. The stun pick lists only enemy units HERE; stunning the big defender lets a 5-Might Vi walk
 *     through a 5-Might wall untouched; with two defenders only one is silenced.
 *  5. Not an attack: moving onto an EMPTY enemy battlefield conquers with no trigger.
 *  6. She is a champion: the most natural Ambush is from the Champion Zone (419.1.a) — flagged.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-176-219";
const DISCIPLINE = "ogn-058-298"; // Reaction, 2: Give a unit +2 Might this turn. Draw 1. (opens a chain on P2's turn)

const playLocations = (game: Game, verb = "play") =>
  (game.p1.option(verb, verb === "play" ? "vi" : undefined)?.fields.find((f) => f.arg === "to" || f.name === "location")?.options as string[] | undefined) ?? [];

/** Pass priority until Vi's trigger leaves the chain, answering its stun pick (if one is asked) with `target`. */
async function resolveStun(game: Game, target: string) {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.p1.pick(target);
    } else {
      await game.acting().pass();
    }
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target); // a lone legal target may also be taken automatically
  }
}

/** Attack bf1 with Vi from base and resolve her trigger onto `target`; stops inside the showdown. */
async function attackAndStun(game: Game, target: string) {
  await game.p1.move("vi", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
  await resolveStun(game, target);
}

/** P2's turn: P1 holds bf1 with a Scout and controls an empty bf2; P2's Raider is about to attack. */
function oppTurn() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

describe("Vi, Peacekeeper (unl-176-219)", () => {
  test("cost on my own turn: 5 energy + 1 order from hand, to base or to a battlefield I control (355.2.a); enters exhausted; unaffordable without the order power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2 }, "scout")
      .hand(P1, CARD, "vi")
      .build();
    expect(playLocations(game).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("vi", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([]); // being played is not attacking
    const poor = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "vi").build();
    expect(poor.p1.can("play", "vi")).toBe(false);
  });

  test("[Ambush] on the opponent's turn: no window in their open state or while they hold Focus; with Focus I play her to bf1 (only where I have units) for 5+order; she defends exhausted and her attack trigger does NOT fire", async () => {
    const game = await oppTurn().hand(P1, CARD, "vi").build();
    expect(game.p1.can("play", "vi")).toBe(false);
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("play", "vi")).toBe(false); // P2 holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(playLocations(game)).toEqual(["battlefield-bf1"]); // not base, not the empty bf2
    await game.p1.play("vi", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi")).toMatchObject({ combatRole: "defender", isExhausted: true });
    expect(game.chain()).toEqual([]); // "When I attack" — she is defending
    expect(game.state("raider").isStunned).toBe(false);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 2 + 5 = 7 ≥ 4
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: without the Ambush the 4-Might Raider kills the 2-Might Scout and takes bf1", async () => {
    const game = await oppTurn().hand(P1, CARD, "vi").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("vi")).toBe("hand");
  });

  test("[Ambush] in a chain window on the opponent's turn (their Discipline pending): legal to bf1 where my Scout is, never to my empty bf2; she lands at once while the spell is still on the chain", async () => {
    const game = await oppTurn().hand(P2, DISCIPLINE, "disc").hand(P1, CARD, "vi").build();
    await game.p2.cast("disc", { targets: "raider" });
    await game.p2.passPriority();
    expect(game.p1.can("play", "vi")).toBe(true);
    expect(playLocations(game)).toEqual(["battlefield-bf1"]);
    const r = await game.p1.try((p) => p.play("vi", { to: "bf2" }));
    expect(r.ok).toBe(false);
    await game.p1.play("vi", { to: "bf1" });
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    await game.settle();
    expect(game.state("raider").might).toBe(6);
  });

  test("[Ambush] from the CHAMPION ZONE (419.1.a) — with Focus in P2's showdown at bf1, playChampion to bf1 should be offered", async () => {
    // Expected: cards are played from hand OR the Champion Zone, so Ambush's Reaction permission
    // applies to Vi waiting in the Champion Zone: playChampion(→ bf1) is legal once P1 holds Focus.
    // Actual: playFromChampionZone is not enumerated at all outside P1's own open main phase.
    const game = await oppTurn().champion(P1, CARD, "vi").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("bf1");
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.champion()).toBeUndefined();
  });

  test("When I attack: the trigger's pick lists only enemy units HERE; stunning the 5-Might Wall means it deals nothing — Wall dies, the 1-Might Tiny survives, Vi (1 damage) is recalled and bf1 stays with P2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P2, "bf1", { might: 1, name: "Tiny" }, "tiny")
      .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "else")
      .unit(P1, "base", CARD, "vi")
      .build();
    await game.p1.move("vi", "bf1");
    let d = game.decision();
    for (let i = 0; i < 6 && d?.kind !== "pick"; i++) {
      await game.acting().pass();
      d = game.decision();
    }
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["tiny", "wall"]);
    await game.p1.pick("wall");
    // rule 402 (finalization): the target is bound at once; the stun lands when the chain item resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("wall").isStunned).toBe(true);
    expect(game.state("tiny").isStunned).toBe(false);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // Vi's 5 is exactly lethal on Wall, nothing left for Tiny
    expect(game.locationOf("tiny")).toBe("bf1");
    expect(game.locationOf("vi")).toBe("base"); // 466 — defenders remain → recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("into a lone 5-Might defender: stun it, take 0, kill it and conquer for 1 point (a vanilla 5 would have traded)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "vi")
      .build();
    await attackAndStun(game, "wall");
    expect(game.state("wall").isStunned).toBe(true);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
    const vanilla = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5 }, "wall").unit(P1, "base", { might: 5 }, "brute").build();
    await vanilla.p1.move("brute", "bf1");
    await vanilla.settle();
    expect(vanilla.zoneOf("brute")).toBe("trash");
    expect(vanilla.zoneOf("wall")).toBe("trash");
  });

  test("the stun is 'this turn': a 7-Might Wall stunned during my attack survives (5 < 7), Vi is recalled unhurt, and after my turn ends the Wall is no longer stunned", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "BigWall" }, "wall")
      .unit(P1, "base", CARD, "vi")
      .build();
    await attackAndStun(game, "wall");
    await game.settle();
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.state("wall").isStunned).toBe(true);
    expect(game.locationOf("vi")).toBe("base");
    expect(game.state("vi").damage).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("wall").isStunned).toBe(false);
  });

  test("moving onto an EMPTY enemy-controlled battlefield is not an attack: no trigger, nothing stunned, bf1 conquered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 1, name: "Bystander" }, "by")
      .unit(P1, "base", CARD, "vi")
      .build();
    await game.p1.move("vi", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("by").isStunned).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Ambush] into my OWN attack: with Focus in my showdown at bf1 (Scout attacking) I play Vi there — she gains Attacker, her trigger fires, the stunned 6-Might Wall deals nothing and falls to 2 + 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "vi")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(playLocations(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("vi", { to: "bf1" });
    expect(game.state("vi")).toMatchObject({ combatRole: "attacker", isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", triggered: true })]);
    await resolveStun(game, "wall");
    expect(game.state("wall").isStunned).toBe(true);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["scout", "vi"]);
    expect(game.state("scout").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("registry payload: champion Vi unit, 5 + [order], 5 Might; abilities = [Ambush keyword, triggered attack(self) → stun an enemy unit here]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, isChampion: true, might: 5, powerCost: ["order"], tags: ["Vi"] });
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      {
        effect: { target: { controller: "enemy", location: "here", type: "unit" }, type: "stun" },
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ]);
  });
});
