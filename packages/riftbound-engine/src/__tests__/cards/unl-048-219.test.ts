/**
 * Trevor Snoozebottom — unl-048-219 · Unit · Calm · 3 energy · 3 might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   When I hold, play a ready 3 [Might] Sprite unit token with [Temporary] here. (Kill it at the
 *   start of its controller's next Beginning Phase, before scoring.)
 *
 * Rules: 814 (Shield X = +X Might only while the unit has the Defender designation), 469.2 /
 * 383.4.d (Hold: keep control of a battlefield during YOUR Beginning Phase → 1 point; "When I hold"
 * triggers only for units AT the held battlefield), 187.2 (Sprite token = domainless 3-Might Fae unit
 * token with Temporary), 816.1.b (Temporary: "at the start of this permanent's controller's Beginning
 * Phase, before scoring, kill this"), 184–186 (tokens cease to exist off the board), "ready" overrides
 * the enters-exhausted default for played units.
 *
 * Head-judge corner cases for THIS card:
 *   1. Shield is defender-only: 4 Might when attacked (a 3-Might attacker bounces and dies; a 4 trades),
 *      but a plain 3 when Trevor attacks or sits idle.
 *   2. The Sprite is made DURING the Beginning Phase it was triggered in — its own Temporary must not
 *      fire that same phase; it survives P1's main phase and all of P2's turn.
 *   3. Steady state: at P1's NEXT Beginning the old Sprite dies (before scoring), Trevor still holds,
 *      a fresh Sprite is played → exactly one Sprite on the board, +1 point per turn.
 *   4. "before scoring": if Trevor is gone and only the Sprite sits at bf1, P1's next Beginning kills
 *      it first and NO hold point is scored.
 *   5. Scope: Trevor in base while something else holds → no Sprite; the opponent's Beginning → nothing;
 *      conquering is not holding.
 *   6. "here" = the held battlefield (not base); the token is READY, 3 Might, Temporary, costless.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-048-219";
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snuff",
  timing: "action",
} as const;

const sprites = (game: Game, at?: "base" | "bf1") => game.p1.units(at).filter((id) => game.state(id).name === "Sprite");

/** P2 is about to end turn 2; P1 controls bf1 with Trevor on it. */
function holding() {
  return scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "trevor");
}

describe("Trevor Snoozebottom (unl-048-219)", () => {
  test("registry payload: Shield 1 keyword + a hold trigger that plays a READY 3-Might Sprite token with Temporary 'here'; 3-cost 3-might Calm unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 3, name: "Trevor Snoozebottom" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Shield", type: "keyword", value: 1 },
      {
        effect: { location: "here", ready: true, token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" }, type: "create-token" },
        trigger: { event: "hold", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 3 energy exactly; enters base exhausted at 3 Might with the Shield keyword; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "trevor").build();
    await game.p1.play("trevor");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("trevor")).toBe("base");
    expect(game.state("trevor")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("trevor").keywords).toContain("Shield");
    expect(game.chain()).toHaveLength(0); // no play trigger on this card
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "trevor").build()).p1.can("play", "trevor")).toBe(false);
  });

  test("[Shield] as defender: reads 4 Might in the showdown; a 3-Might attacker dies, Trevor survives undamaged and bf1 stays with P1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "trevor")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("trevor").might).toBe(3); // idle: no bonus
    await game.p2.move("raider", "bf1");
    expect(game.state("trevor")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("trevor")).toBe("battlefield-bf1");
    expect(game.state("trevor")).toMatchObject({ damage: 0, might: 3 }); // healed, Shield off after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Shield] exactly-lethal edge: a 4-Might attacker trades with the 4-Might defending Trevor (both die, no conquer point)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "trevor")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("trevor")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.points()).toBe(0);
  });

  test("[Shield] is defender-only: Trevor ATTACKING a 3-Might defender fights at 3 and trades", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "trevor", { exhausted: false })
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.move("trevor", "bf1");
    expect(game.state("trevor")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.zoneOf("trevor")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("When I hold: the trigger sits on the chain in P1's Beginning Phase (hold point already scored), then a READY 3-Might Sprite token with Temporary appears at bf1 — not in base", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trevor", controller: P1, triggered: true })]);
    expect(sprites(game)).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(sprites(game, "base")).toHaveLength(0);
    const [sprite] = sprites(game, "bf1");
    expect(sprites(game, "bf1")).toHaveLength(1);
    expect(game.state(sprite!)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, energyCost: 0, isExhausted: false, isReady: true, isToken: true, might: 3 });
    expect(game.state(sprite!).keywords).toContain("Temporary");
    expect(game.state(sprite!).keywords).not.toContain("Shield");
    expect(game.state(sprite!).domains).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the fresh Sprite's own [Temporary] does not fire in the Beginning Phase it was created in: it survives P1's whole turn and P2's turn", async () => {
    const game = await holding().build();
    await game.advanceTurn(); // → P1: hold, Sprite
    const [sprite] = sprites(game, "bf1");
    expect(sprite).toBeDefined();
    await game.advanceTurn(); // → P2's turn: not the controller's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(sprite!)).toBe(true);
    expect(game.locationOf(sprite!)).toBe("bf1");
    expect(game.p1.units("bf1")).toHaveLength(2);
  });

  test("steady state: at P1's NEXT Beginning the old Sprite is killed, Trevor holds again and plays a NEW one → exactly one Sprite, 2 points after two holds", async () => {
    const game = await holding().build();
    await game.advanceTurn(); // P1 turn 3: hold #1
    const [first] = sprites(game, "bf1");
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 turn 5: old Sprite dies, hold #2, new Sprite
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.has(first!)).toBe(false); // ceased to exist — tokens never reach the trash
    expect(game.p1.trash()).toEqual([]);
    const now = sprites(game, "bf1");
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first);
    expect(game.state(now[0]!).isReady).toBe(true);
  });

  test("'before scoring': with Trevor killed and only the Sprite left at bf1, P1's next Beginning kills the Sprite first — no hold point, bf1 uncontrolled", async () => {
    const game = await holding().hand(P2, KILL, "snuff").build();
    await game.advanceTurn(); // P1: hold (1 pt) + Sprite
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // P2's turn
    await game.p2.cast("snuff", { targets: "trevor" });
    await game.settle();
    expect(game.zoneOf("trevor")).toBe("trash");
    expect(sprites(game, "bf1")).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn(); // P1's Beginning: Temporary kill, then scoring finds nobody home
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game)).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("negative space: Trevor in base while a vanilla unit holds bf1 → 1 point but no Sprite; the opponent's Beginning Phase → nothing at all", async () => {
    const inBase = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", CARD, "trevor")
      .build();
    await inBase.advanceTurn();
    expect(inBase.p1.points()).toBe(1);
    expect(sprites(inBase)).toHaveLength(0);

    const oppTurn = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "trevor").build();
    await oppTurn.advanceTurn();
    expect(oppTurn.turnPlayer()).toBe(P2);
    expect(oppTurn.p1.points()).toBe(0);
    expect(sprites(oppTurn)).toHaveLength(0);
  });

  test("conquering is not holding: Trevor walking onto an empty enemy battlefield scores the conquer point but plays no Sprite", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "trevor", { exhausted: false })
      .build();
    await game.p1.move("trevor", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(sprites(game)).toHaveLength(0);
    expect(game.chain()).toHaveLength(0);
  });

  test("the Sprite defends alongside Trevor on P2's turn: a 6-Might attacker into Trevor(3+1 Shield)+Sprite(3) takes 7 and dies; P2 scores nothing", async () => {
    const game = await holding().unit(P2, "base", { might: 6, name: "Giant" }, "giant").build();
    await game.advanceTurn(); // P1: Sprite
    await game.advanceTurn(); // P2
    await game.p2.move("giant", "bf1");
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    // 6 damage cannot cover Trevor(4) + Sprite(3) = 7: at least one defender is still standing.
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
  });
});
