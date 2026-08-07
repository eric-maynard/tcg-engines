/**
 * Shard of Undoing — unl-174-219 · Gear · Order · 6 energy (no power)
 *
 *   The first time a friendly unit dies during your Beginning Phase each turn, each opponent must
 *   kill one of their units.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The natural enabler is [Temporary] (816: "kill this at the start of your Beginning Phase") —
 *      a friendly Sprite token dying then is exactly "a friendly unit dies during your Beginning
 *      Phase". The trigger goes on the chain and the Beginning Phase holds for it. Same-domain
 *      partner Shadow's Call (give a friendly unit [Temporary]) sets up the NEXT turn's death.
 *   2. "each opponent must kill one of THEIR units": the OPPONENT chooses which of their own units
 *      dies (their instruction, not a target you pick); with one unit it is forced; with none,
 *      nothing happens; your own units are never candidates.
 *   3. "The first time … each turn": two Sprites expiring in the same Beginning Phase are two deaths
 *      but only ONE trigger (383.1 / 383.2.c) — the opponent loses exactly one unit; the count resets
 *      next turn.
 *   4. Window: ONLY your Beginning Phase. A friendly death on the opponent's turn, or during your own
 *      Main Phase (combat, your own spell), must not fire it. (The card file approximates the window
 *      as "during your turn" — the main-phase cases misfire today.)
 *   5. Plain gear: 6 energy, enters ready, nothing to activate; does nothing from hand.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-174-219";
const SPRITE = "ogn-274-298"; // 3-Might unit token with [Temporary]
const SHADOWS_CALL = "unl-165-219"; // Order spell, 2: give a friendly unit [Temporary], draw 2
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield

/** P2 is about to end the turn; P1 has the Shard and `sprites` Temporary Sprites in base. */
function beforeP1Turn(sprites: number, p2Units: number) {
  const b = scenario().turn(2).active(P2).gear(P1, CARD, "shard").unit(P1, "base", { might: 4, name: "Keeper" }, "keeper");
  for (let i = 0; i < sprites; i++) {
    b.unit(P1, "base", SPRITE, `sprite${i}`);
  }
  for (let i = 0; i < p2Units; i++) {
    b.unit(P2, "base", { might: 2 + i, name: `Victim${i}` }, `victim${i}`);
  }
  return b;
}

const alive = (game: Game, id: string) => game.has(id) && (game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-"));

/** Answer every pending "which unit dies" prompt with `choice` — whichever seat the engine asks — and settle. */
async function answerKills(game: Game, choice: string): Promise<number> {
  let prompts = 0;
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    prompts++;
    const keys = d.options.map((o) => o.card ?? o.key);
    await game.seat(d.seat).pick(keys.includes(choice) ? choice : (keys[0] as string));
  }
  return prompts;
}

describe("Shard of Undoing (unl-174-219)", () => {
  test("registry payload: one triggered ability — friendly-unit death, first time each turn, your window → each opponent kills one of their units", async () => {
    const game = await scenario().hand(P1, CARD, "shard").build();
    expect(game.state("shard")).toMatchObject({ cardType: "gear", energyCost: 6, name: "Shard of Undoing" });
    expect(game.state("shard").powerCost).toEqual([]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as { type: string; effect: unknown; trigger: { event: string; on: string; restrictions: { type: string; whose?: string }[] } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { player: "each", target: { controller: "enemy", type: "unit" }, type: "kill" },
      trigger: { event: "die", on: "friendly-units" },
      type: "triggered",
    });
    const restrictions = abilities[0]?.trigger.restrictions ?? [];
    expect(restrictions).toEqual(expect.arrayContaining([{ type: "first-time-each-turn" }]));
    expect(restrictions.some((r) => r.whose === "your")).toBe(true);
  });

  test("cost: 6 energy, no power; lands in base ready with nothing on the chain and nothing to activate; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "shard").build();
    await game.p1.play("shard");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("shard")).toBe("base");
    expect(game.state("shard").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "shard")).toBe(false);
    const poor = await scenario().resources(P1, { energy: 5, power: { order: 3 } }).hand(P1, CARD, "shard").build();
    expect(poor.p1.can("play", "shard")).toBe(false);
  });

  test("a friendly Sprite expiring at the start of your Beginning Phase fires it: the opponent's only unit must die; your other units are untouched", async () => {
    const game = await beforeP1Turn(1, 1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(alive(game, "sprite0")).toBe(false);
    expect(game.zoneOf("victim0")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.zoneOf("shard")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is a chain item during the Beginning Phase (the phase holds for it) before anything is killed", async () => {
    const game = await beforeP1Turn(1, 1).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "shard"); i++) {
      const d = game.decision();
      if (!d || d.kind !== "action") {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "shard", controller: P1, triggered: true })]));
    expect(game.zoneOf("victim0")).toBe("base"); // not yet
    await game.settle();
    expect(game.zoneOf("victim0")).toBe("trash");
    expect(game.phase()).toBe("main");
  });

  test("'one of THEIR units' — the OPPONENT must choose which of their units dies; the engine asks the Shard's controller instead", async () => {
    // Expected: with two candidates the pick prompt belongs to P2 (it is P2's instruction to kill).
    // Actual: a "Choose a target for Shard of Undoing" prompt is given to P1.
    const game = await beforeP1Turn(1, 2).build();
    await game.p2.endTurn();
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    const offered = (game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["victim0", "victim1"]);
    await game.p2.pick("victim1");
    await game.settle();
    expect(game.zoneOf("victim1")).toBe("trash");
    expect(game.zoneOf("victim0")).toBe("base");
  });

  test("whoever is asked, the candidates are only the OPPONENT's units (never your Keeper) and exactly the picked one dies", async () => {
    const game = await beforeP1Turn(1, 2).build();
    await game.p2.endTurn();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["victim0", "victim1"]);
    expect(await answerKills(game, "victim1")).toBe(1);
    expect(game.zoneOf("victim1")).toBe("trash");
    expect(game.zoneOf("victim0")).toBe("base");
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.phase()).toBe("main");
  });

  test("opponent with NO units: the trigger resolves harmlessly and the turn proceeds to P1's main phase", async () => {
    const game = await beforeP1Turn(1, 0).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.zoneOf("shard")).toBe("base");
    expect(game.isOver()).toBe(false);
  });

  test("'the FIRST time … each turn': two Sprites expiring in the same Beginning Phase cost the opponent exactly ONE unit (one prompt, one death)", async () => {
    const game = await beforeP1Turn(2, 2).build();
    await game.p2.endTurn();
    const prompts = await answerKills(game, "victim0");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(alive(game, "sprite0")).toBe(false);
    expect(alive(game, "sprite1")).toBe(false);
    expect(prompts).toBeLessThanOrEqual(1);
    expect(["victim0", "victim1"].filter((v) => game.zoneOf(v) === "trash")).toEqual(["victim0"]);
  });

  test("'each turn' resets — with Shadow's Call: turn A the Sprite dies (victim0); P1 gives Keeper [Temporary]; next P1 Beginning Phase Keeper dies and it fires AGAIN (victim1)", async () => {
    const game = await beforeP1Turn(1, 2).hand(P1, SHADOWS_CALL, "call").build();
    await game.p2.endTurn();
    await answerKills(game, "victim0");
    expect(game.zoneOf("victim0")).toBe("trash");
    expect(game.zoneOf("victim1")).toBe("base");
    await game.p1.tapRunes(2); // the two runes channeled this turn pay for Shadow's Call
    await game.p1.cast("call", { targets: "keeper" });
    await game.settle();
    expect(game.state("keeper").keywords).toContain("Temporary");
    await game.advanceTurn(); // P2's turn — nothing happens to victim1 there
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("victim1")).toBe("base");
    await game.p2.endTurn(); // P1's Beginning: Keeper dies → Shard fires again
    await answerKills(game, "victim1");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.zoneOf("victim1")).toBe("trash");
  });

  test("only YOUR turn's window: a friendly unit dying on the OPPONENT's turn (their attack kills your defender) does not fire it", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "shard")
      .unit(P1, "bf1", { might: 1, name: "Doomed" }, "doomed")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.chain().some((c) => c.cardId === "shard")).toBe(false);
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("an ENEMY unit dying is not 'a friendly unit': the opponent's own Sprite expiring at THEIR turn start costs nobody anything", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .gear(P1, CARD, "shard")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .unit(P2, "base", SPRITE, "theirSprite")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(alive(game, "theirSprite")).toBe(false);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("only the BEGINNING Phase — a friendly unit dying in COMBAT during your Main Phase must not fire it", async () => {
    // Expected: P1's Scout dies attacking in P1's action phase → no Shard item, no prompt, P2 keeps both units.
    // Actual: the restriction is `during-turn/your`, so the Shard goes on the chain and a kill prompt opens.
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "shard")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .build();
    expect(game.phase()).toBe("main");
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("bystander")).toBe("base");
  });

  test("only the BEGINNING Phase — killing your own unit with a spell in your Main Phase must not fire it either", async () => {
    // Expected: Bystander (P2's only unit) survives. Actual: the Shard fires and, being the only
    // candidate, Bystander is killed automatically.
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "shard")
      .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("base");
  });

  test("in hand (not on the board) it does nothing when your Sprite expires", async () => {
    const game = await scenario().turn(2).active(P2).hand(P1, CARD, "shard").unit(P1, "base", SPRITE, "sprite").unit(P2, "base", { might: 2 }, "victim").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(alive(game, "sprite")).toBe(false);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("shard")).toBe("hand");
  });
});
