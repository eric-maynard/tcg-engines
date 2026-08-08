/**
 * Sprite Queen — unl-084-219 · Unit · Mind · 7 energy + [mind] · 6 Might
 *
 *   When you play me or at the start of your Beginning Phase, play a ready 3 [Might] Sprite unit
 *   token with [Temporary] to your base. (Kill them at the start of their controller's next
 *   Beginning Phase, before scoring.)
 *
 * Rules: 383.4.a (play effect = chain item), 315.2.a (start-of-Beginning-Phase effects, before the
 * Scoring Step 315.2.b), 187.2 (a 3 [M] Sprite token: domainless unit token, 3 Might, Temporary),
 * 184.1 ("play a READY … token" overrides units entering exhausted), 182 ("to your base" regardless of
 * where the Queen is), 816 (Temporary: killed at the start of its CONTROLLER's Beginning Phase — the
 * NEXT one, so a Sprite made during a Beginning Phase survives that phase), 186.1 (a token leaving
 * the board ceases to exist), 108.2 ("your"/"you" = controller).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Two start-of-Beginning-Phase events meet every turn: last turn's Sprite dies (Temporary) and a
 *     fresh one is played — the fresh one must NOT be swept by the same phase → exactly one (new)
 *     Sprite each of your main phases, forever; and all of it happens before you score holds.
 *  2. "to your base" even when the Queen is played to / sits at a battlefield; the token is READY, so
 *     the play-trigger Sprite can march out and conquer the same turn.
 *  3. Only YOUR Beginning Phase, only while the Queen is on the board (not from hand/trash, not after
 *     she died); two Queens → two Sprites.
 *  4. Controller ≠ owner: a Queen stolen with Possession makes Sprites at the THIEF's turn start.
 *  5. Partners (Mind): Soul Shepherd makes the Sprite 4 Might; Zilean at a battlefield turns each
 *     "play a token" into two (once per turn) — both the play trigger and the Beginning-Phase one.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-084-219";
const SOUL_SHEPHERD = "unl-077-219"; // Mind 5: Your token units have +1 [Might].
const ZILEAN = "unl-086-219"; // Mind 5: Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token and an additional copy of it instead.
const POSSESSION = "ogn-203-298"; // Chaos 8 + chaos×3: take control of an enemy unit at a battlefield and recall it.

const sprites = (game: Game, seat: "p1" | "p2") => game[seat].units().filter((id) => game.state(id).name === "Sprite");

function queenInHand() {
  return scenario().resources(P1, { energy: 7, power: { mind: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor").hand(P1, CARD, "queen");
}

describe("Sprite Queen (unl-084-219)", () => {
  test("cost: 7 energy + 1 mind for a 6-Might unit that enters exhausted; short of energy or of mind power → not playable", async () => {
    const game = await queenInHand().build();
    await game.p1.play("queen", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("queen")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6, zone: "base" });
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "q").build()).p1.can("play", "q")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { mind: 3 } }).hand(P1, CARD, "q").build()).p1.can("play", "q")).toBe(false);
  });

  test("When you play me: the play effect waits on the chain, then exactly ONE Sprite appears in your BASE — a READY, domainless 3-Might unit TOKEN with [Temporary], controlled and owned by you", async () => {
    const game = await queenInHand().build();
    await game.p1.play("queen", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "queen", controller: P1, triggered: true })]);
    expect(sprites(game, "p1")).toHaveLength(0); // not before resolution
    await game.settle();
    const made = sprites(game, "p1");
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isReady: true, isToken: true, might: 3, owner: P1, zone: "base" });
    expect(game.state(made[0]!).keywords).toEqual(["Temporary"]);
    expect(game.state(made[0]!).domains).toEqual([]);
    expect(sprites(game, "p2")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("'to your base' even when the Queen herself is played to a battlefield; and being READY the Sprite can march onto an open battlefield and conquer this very turn", async () => {
    const game = await queenInHand().battlefield("bf2", { controller: null }).build();
    await game.p1.play("queen", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("queen")).toBe("battlefield-bf1");
    const [sprite] = sprites(game, "p1");
    expect(game.state(sprite!)).toMatchObject({ isReady: true, zone: "base" });
    expect(game.cardsAt("bf1").some((id) => game.state(id).name === "Sprite")).toBe(false);
    await game.p1.move(sprite!, "bf2");
    await game.settle();
    expect(game.locationOf(sprite!)).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("at the start of YOUR Beginning Phase (Queen on the board): the trigger holds the phase on the chain, then a ready Sprite lands in base — before the Scoring Step, which still awards the hold", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "queen").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "queen", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0); // scoring has not happened yet (315.2.a before 315.2.b)
    await game.settle();
    expect(game.phase()).toBe("main");
    const made = sprites(game, "p1");
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ isReady: true, isToken: true, might: 3, zone: "base" });
    expect(game.p1.points()).toBe(1); // Queen held bf1
  });

  test("the engine that never stalls: play-Sprite survives the opponent's turn, dies at your next Beginning Phase while a FRESH one is played (not swept by the same phase) → exactly one, new, ready Sprite every one of your turns", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 1 } }).hand(P1, CARD, "queen").build();
    await game.p1.play("queen");
    await game.settle();
    const gen0 = sprites(game, "p1");
    expect(gen0).toHaveLength(1);
    await game.advanceTurn(); // → P2: nothing changes
    expect(sprites(game, "p1")).toEqual(gen0);
    expect(sprites(game, "p2")).toHaveLength(0);
    await game.advanceTurn(); // → P1: gen0 killed (ceases to exist), gen1 played
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(gen0[0]!)).toBe(false);
    const gen1 = sprites(game, "p1");
    expect(gen1).toHaveLength(1);
    expect(gen1[0]).not.toBe(gen0[0]);
    expect(game.state(gen1[0]!)).toMatchObject({ isReady: true, might: 3, zone: "base" });
    await game.advanceTurn();
    await game.advanceTurn(); // → P1 again
    const gen2 = sprites(game, "p1");
    expect(gen2).toHaveLength(1);
    expect(gen2[0]).not.toBe(gen1[0]);
    expect(game.has(gen1[0]!)).toBe(false);
    expect(game.p1.trash().some((id) => game.state(id).name === "Sprite")).toBe(false); // 186.1: tokens don't pile up in the trash
  });

  test("negative space — only YOUR Beginning Phase and only from the board: nothing at the opponent's turn start; nothing with the Queen in hand or in the trash", async () => {
    const onBoard = await scenario().turn(3).active(P1).unit(P1, "base", CARD, "queen").build();
    await onBoard.advanceTurn(); // → P2's turn begins
    expect(onBoard.turnPlayer()).toBe(P2);
    expect(sprites(onBoard, "p1")).toHaveLength(0);
    expect(sprites(onBoard, "p2")).toHaveLength(0);

    const offBoard = await scenario().turn(2).active(P2).hand(P1, CARD, "inhand").trash(P1, CARD, "intrash").build();
    await offBoard.advanceTurn(); // → P1's turn begins
    expect(offBoard.turnPlayer()).toBe(P1);
    expect(sprites(offBoard, "p1")).toHaveLength(0);
    expect(offBoard.transcript().steps.flatMap((s) => s.executed.map((e) => e.moveId))).toEqual(["endTurn"]);
  });

  test("negative space — a Queen killed in combat makes no more Sprites: next Beginning Phase only the Temporary death happens (0 Sprites)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .hand(P1, CARD, "queen")
      .build();
    await game.p1.play("queen");
    await game.settle();
    expect(sprites(game, "p1")).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn(); // → P1: Queen readied in Awaken; still alive
    await game.p1.move("queen", "bf1");
    await game.settle();
    expect(game.zoneOf("queen")).toBe("trash"); // 6 < 7
    const before = sprites(game, "p1"); // this turn's Beginning-Phase Sprite
    expect(before).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn(); // → P1 with no Queen
    expect(sprites(game, "p1")).toHaveLength(0);
    expect(game.has(before[0]!)).toBe(false);
  });

  test("two Queens on the board → two Beginning-Phase triggers → two Sprites", async () => {
    const game = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "q1").unit(P1, "base", CARD, "q2").build();
    await game.p2.endTurn();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["q1", "q2"]);
    await game.settle();
    expect(sprites(game, "p1")).toHaveLength(2);
  });

  test("controller ≠ owner (108.2, 816.1.c) — a Queen stolen with Possession sits in P2's base: P1's next Beginning Phase makes nothing, P2's makes a Sprite for P2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "queen")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P2, POSSESSION, "pos")
      .build();
    await game.p2.cast("pos", { targets: "queen" });
    await game.settle();
    expect(game.state("queen")).toMatchObject({ controller: P2, owner: P1, zone: "base" });
    await game.advanceTurn(); // → P1 (the OWNER's Beginning Phase)
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game, "p1")).toHaveLength(0);
    expect(sprites(game, "p2")).toHaveLength(0);
    await game.advanceTurn(); // → P2 (the CONTROLLER's Beginning Phase)
    expect(game.turnPlayer()).toBe(P2);
    expect(sprites(game, "p1")).toHaveLength(0);
    const theirs = sprites(game, "p2");
    expect(theirs).toHaveLength(1);
    expect(game.state(theirs[0]!)).toMatchObject({ controller: P2, isReady: true, might: 3, zone: "base" });
  });

  test("partner — Soul Shepherd ('your token units have +1 Might'): the Sprite is a 4-Might body (base 3), the non-token Queen stays 6", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 1 } }).unit(P1, "base", SOUL_SHEPHERD, "shep").hand(P1, CARD, "queen").build();
    await game.p1.play("queen");
    await game.settle();
    const [sprite] = sprites(game, "p1");
    expect(game.state(sprite!)).toMatchObject({ baseMight: 3, might: 4 });
    expect(game.state("queen").might).toBe(6);
  });

  test("partner — Zilean at a battlefield ('if you would play a token unit … play that token and an additional copy instead', once each turn): the play trigger yields TWO Sprites, and so does the next Beginning-Phase trigger (new turn, new 'once')", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", ZILEAN, "zil").hand(P1, CARD, "queen").build();
    await game.p1.play("queen", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes(); // "you may"
      await game.settle();
    }
    const gen0 = sprites(game, "p1");
    expect(gen0).toHaveLength(2);
    for (const id of gen0) {
      expect(game.state(id)).toMatchObject({ isReady: true, isToken: true, might: 3, zone: "base" }); // 375: the copy inherits "ready"
    }
    game.script(P1, [(d) => (d.kind === "yes-no" ? true : undefined)]);
    await game.advanceTurn();
    await game.advanceTurn(); // → P1: both old Sprites die, the Beginning-Phase token is doubled again
    expect(game.turnPlayer()).toBe(P1);
    const gen1 = sprites(game, "p1");
    expect(gen1).toHaveLength(2);
    expect(gen1.some((id) => gen0.includes(id))).toBe(false);
  });

  test("registry payload matches the printed text: two triggered abilities (play-self; start of controller's Beginning Phase) with the SAME effect — create one READY 3-Might 'Sprite' unit token with Temporary in base; 7 + [mind], 6 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 7, might: 6, name: "Sprite Queen" });
    expect(def?.powerCost).toEqual(["mind"]);
    const effect = { location: "base", ready: true, token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" }, type: "create-token" };
    expect(def?.abilities).toEqual([
      { effect, trigger: { event: "play-self" }, type: "triggered" },
      { effect, trigger: { event: "beginning-phase", on: "controller", timing: "at" }, type: "triggered" },
    ]);
  });
});
