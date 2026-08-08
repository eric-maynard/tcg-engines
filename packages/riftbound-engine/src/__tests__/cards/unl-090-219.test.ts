/**
 * LeBlanc, Everywhere at Once — unl-090-219 · Champion Unit (LeBlanc) · Mind · 4 energy · 4 might
 *
 *   [Backline] (I must be assigned combat damage last.)
 *   Your [Temporary] effects at my battlefield don't trigger.
 *
 * Rules: 826 (Backline: an invalid combat-damage assignment until every same-side unit WITHOUT
 * Backline has lethal assigned — 826.4.b, 465.2.c.6), 816 (Temporary is a TRIGGERED ability keyword:
 * "at the start of this permanent's controller's Beginning Phase, before scoring, kill this"), so
 * "don't trigger" means the kill simply never happens while the condition holds; "Your" = effects
 * on permanents LeBlanc's controller controls; "at my battlefield" = LeBlanc's current battlefield
 * (a base is not a battlefield), 469.2 (Hold scoring happens after the Temporary step).
 *
 * Head-judge corner cases for THIS card:
 *   1. Backline ordering: a 3-Might attacker into LeBlanc(4)+Ally(2) must put lethal on the Ally
 *      first; with two 2-Might allies P2 gets a real split, but any point on LeBlanc is refused until
 *      both allies have lethal.
 *   2. Backline is not damage prevention: 6 into LeBlanc+Ally(2) kills both (2 then 4); 5 kills only
 *      the Ally (3 < 4 on LeBlanc, healed after combat).
 *   3. Suppression scope — positive: your Sprite at LeBlanc's battlefield survives your Beginning
 *      Phase (and, still being there, the battlefield is held and scores). With Trevor Snoozebottom
 *      there too, Sprites accumulate turn over turn.
 *   4. Suppression scope — negative: your Sprite at ANOTHER battlefield dies; your Sprite in BASE dies
 *      even with LeBlanc in base ("battlefield"); an ENEMY Sprite at LeBlanc's battlefield still dies
 *      on its controller's turn ("Your"); once LeBlanc has left, the Sprite dies normally.
 *   5. Cost/identity: 4 energy, no power, champion (playable from the Champion zone), LeBlanc tag.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-090-219";
const SPRITE = "unl-t07"; // 3-Might Sprite unit token printing with [Temporary]
const TREVOR = "unl-048-219"; // Shield; When I hold, play a ready 3-Might Sprite token with Temporary here
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snuff",
  timing: "action",
} as const;

const spritesAt = (game: Game, seat: "p1" | "p2", at: "base" | "bf1" | "bf2") =>
  game[seat].units(at).filter((id) => game.state(id).name === "Sprite");

/** P2 about to end turn 2; P1 controls bf1 with LeBlanc and a Sprite on it. */
function withSprite() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "lb")
    .unit(P1, "bf1", SPRITE, "sprite");
}

describe("LeBlanc, Everywhere at Once (unl-090-219)", () => {
  test("registry payload: two statics — Backline on self and the 'suppress your Temporary here' marker; 4-cost 4-might Mind champion tagged LeBlanc, no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, isChampion: true, might: 4, name: "LeBlanc, Everywhere at Once", tags: ["LeBlanc"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { keyword: "Backline", target: "self", type: "grant-keyword" }, type: "static" },
      { effect: { keyword: "SuppressTemporaryHere", target: "self", type: "grant-keyword" }, type: "static" },
    ]);
  });

  test("cost: 4 energy exactly from hand → base, exhausted, 4 Might, has Backline; 3 energy is not enough; also offered from the Champion zone", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "lb").build();
    await game.p1.play("lb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("base");
    expect(game.state("lb")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("lb").keywords).toContain("Backline");
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lb").build()).p1.can("play", "lb")).toBe(false);
    const champ = await scenario().resources(P1, { energy: 4 }).champion(P1, CARD, "lb").build();
    expect(champ.p1.can("playChampion")).toBe(true);
    expect((await scenario().resources(P1, { energy: 3 }).champion(P1, CARD, "lb").build()).p1.can("playChampion")).toBe(false);
  });

  test("[Backline] combat: a 3-Might attacker into LeBlanc(4)+Ally(2) — lethal lands on the Ally first, LeBlanc takes the leftover 1 and lives; the attacker takes 6 and dies; bf1 held", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.state("lb").damage).toBe(0); // 1 taken, healed at combat cleanup
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("826.4.b: with LeBlanc + two 2-Might allies vs 3 damage P2 chooses the split, but ANY damage on LeBlanc is refused until both allies have lethal", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf1", { might: 2, name: "A" }, "a")
      .unit(P1, "bf1", { might: 2, name: "B" }, "b")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    expect((await game.p2.try((p) => p.distribute({ lb: 3 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ a: 2, lb: 1 }))).ok).toBe(false); // B lacks lethal
    expect((await game.p2.try((p) => p.distribute({ a: 1, b: 1, lb: 1 }))).ok).toBe(false); // nobody has lethal
    await game.p2.distribute({ a: 1, b: 2 });
    if (game.p2.can("resolveFullCombat")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("[Backline] is ordering, not prevention: 6 into LeBlanc+Ally(2) kills both (2 then exactly 4); 5 kills only the Ally (3 on LeBlanc < 4)", async () => {
    const six = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 6, name: "Giant" }, "giant")
      .build();
    await six.p2.move("giant", "bf1");
    await six.settle();
    expect(six.zoneOf("ally")).toBe("trash");
    expect(six.zoneOf("lb")).toBe("trash");
    expect(six.zoneOf("giant")).toBe("trash"); // took 4 + 2

    const five = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    await five.p2.move("brute", "bf1");
    await five.settle();
    expect(five.zoneOf("ally")).toBe("trash");
    expect(five.zoneOf("lb")).toBe("battlefield-bf1");
    expect(five.state("lb").damage).toBe(0);
    expect(five.zoneOf("brute")).toBe("trash");
    expect(five.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("your [Temporary] Sprite at LeBlanc's battlefield does NOT die at the start of your Beginning Phase — it stays, and bf1 is still held for 1 point (suppression static not implemented)", async () => {
    // Expected: after P2 ends the turn, P1's Beginning skips the Sprite's Temporary trigger (816 is a
    // triggered ability and LeBlanc says it doesn't trigger here); Sprite + LeBlanc still at bf1, 1 point.
    // Actual: the flow kills every Temporary permanent of the turn player regardless of LeBlanc.
    const game = await withSprite().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("sprite")).toBe("bf1");
    expect(spritesAt(game, "p1", "bf1")).toHaveLength(1);
    // …and it keeps surviving on later turns while LeBlanc stays.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("sprite")).toBe("bf1");
  });

  test("partner — Trevor Snoozebottom at LeBlanc's battlefield: each hold adds a Sprite and none expire, so two holds leave TWO Sprites at bf1 (suppression not implemented)", async () => {
    // Expected: hold #1 → Sprite A; P1's next Beginning: A's Temporary is suppressed, hold #2 → Sprite B;
    // bf1 has LeBlanc, Trevor, A, B. Actual: A is killed before hold #2, leaving one Sprite.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf1", TREVOR, "trevor")
      .build();
    await game.advanceTurn(); // P1: hold #1
    expect(spritesAt(game, "p1", "bf1")).toHaveLength(1);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1: hold #2
    expect(game.p1.points()).toBe(2);
    expect(spritesAt(game, "p1", "bf1")).toHaveLength(2);
    expect(game.p1.units("bf1")).toHaveLength(4);
  });

  test("'at my battlefield' — negative space: your Sprite at a DIFFERENT battlefield, and your Sprite in base (even with LeBlanc also in base), still die at your Beginning Phase", async () => {
    const elsewhere = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P1, "bf2", SPRITE, "far")
      .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .build();
    await elsewhere.advanceTurn();
    expect(elsewhere.turnPlayer()).toBe(P1);
    expect(elsewhere.locationOf("far")).toBeUndefined(); // killed (a placed printing goes to trash; a true token would cease)
    expect(elsewhere.p1.units("bf2")).toEqual(["anchor"]);
    expect(elsewhere.locationOf("lb")).toBe("bf1");
    expect(elsewhere.p1.points()).toBe(2);

    const inBase = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "lb").unit(P1, "base", SPRITE, "homeSprite").build();
    await inBase.advanceTurn();
    expect(inBase.turnPlayer()).toBe(P1);
    expect(inBase.locationOf("homeSprite")).toBeUndefined(); // a base is not a battlefield
    expect(inBase.p1.units("base")).toEqual(["lb"]);
  });

  test("'Your' — an ENEMY Sprite sharing LeBlanc's battlefield is not protected: it dies at the start of ITS controller's (P2's) Beginning Phase", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lb")
      .unit(P2, "bf1", SPRITE, "theirs")
      .build();
    expect(game.locationOf("theirs")).toBe("bf1");
    await game.advanceTurn(); // → P2's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf("theirs")).toBeUndefined();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
  });

  test("once LeBlanc has left the battlefield (killed on P2's turn), nothing suppresses the trigger: the Sprite dies at P1's next Beginning and the empty bf1 scores no hold", async () => {
    const game = await withSprite().hand(P2, KILL, "snuff").build();
    await game.p2.cast("snuff", { targets: "lb" });
    await game.settle();
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.locationOf("sprite")).toBe("bf1");
    await game.advanceTurn(); // → P1's Beginning
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("sprite")).toBeUndefined();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });
});
