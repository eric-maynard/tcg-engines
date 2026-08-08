/**
 * Diana, No Longer Human — ven-183-166 · Champion Unit (Diana) · Chaos · 4 energy + [chaos] · 3 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play a spell, give me +2 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Ambush (822.1.b) is TWO permissions bundled: an extra play LOCATION (a battlefield where you control
 *     units) and Reaction TIMING — but the timing applies only "as long as I'm being played to a
 *     battlefield where you control units". Playing to base on the opponent's turn stays illegal; a
 *     battlefield with NO friendly unit is never opened up.
 *  2. The natural line: opponent attacks my battlefield → I Ambush Diana in as an extra defender, then
 *     answer with a spell → she fights at 5. Both halves of the card matter in one combat.
 *  3. "When you play a spell" fires when the spell RESOLVES (359.3.e.10: a spell is played as it
 *     resolves; a countered one never was). Each spell is a separate +2; an opponent's spell is not "you".
 *  4. "this turn": the +2 is gone after the turn passes; the printed 3 remains.
 *  5. Zone gate: Diana in hand / champion zone is not on the board — spells cast before she arrives give
 *     her nothing retroactively.
 *  6. Cost: 4 energy AND a chaos pip, from hand or from the champion zone.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-183-166";
const WIND_WALL = "ogn-064-298"; // [Reaction] Counter a spell. (3 energy, 2 calm)

/** Inline [Action] spell with no targets: draw 1. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Moonlit Trick",
  rulesText: "[Action] Draw 1.",
  timing: "action",
} as const;

const playLocations = (game: { p1: { option: (m: string, c: string) => { fields: readonly { arg?: string; name?: string; options?: readonly unknown[] }[] } | undefined } }, card: string) =>
  ((game.p1.option("play", card) ?? game.p1.option("playUnit", card))?.fields.find((f) => f.arg === "to" || f.name === "location")?.options as string[] | undefined) ?? [];

/** P2's turn; P1 holds bf1 with a 2-Might Scout, P2 has a 4-Might Raider in base; Diana + a Trick in P1's hand, fully funded. */
function ambushBoard() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, CARD, "diana")
    .hand(P1, TRICK, "trick");
}

describe("Diana, No Longer Human (ven-183-166)", () => {
  test("costs 4 energy + [chaos]; on your own turn she plays to base as a 3-Might unit; short on energy or missing the chaos pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "diana").build();
    await game.p1.play("diana", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("diana")).toBe("base");
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 3 });
    expect(game.state("diana").keywords).toContain("Ambush");
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "d").build()).p1.can("play", "d")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 2 } }).hand(P1, CARD, "d").build()).p1.can("play", "d")).toBe(false);
  });

  test("own turn, Neutral Open: [Ambush] adds the battlefield where I have units (bf1) as a destination; an empty battlefield (bf2) is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "diana")
      .build();
    const locs = playLocations(game, "diana");
    expect(locs).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(locs).not.toContain("battlefield-bf2");
    expect((await game.p1.try((p) => p.play("diana", { to: "bf2" }))).ok).toBe(false);
    await game.p1.play("diana", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("diana")).toBe("bf1");
  });

  test("[Ambush] as a Reaction: on the OPPONENT's turn nothing is legal in their Neutral Open state; once they attack bf1 and pass Focus, Diana may be played to bf1 (not to base, not to bf2)", async () => {
    const game = await ambushBoard().build();
    expect(game.p1.can("play", "diana")).toBe(false);
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "diana")).toBe(true);
    const locs = playLocations(game, "diana");
    expect(locs).toEqual(["battlefield-bf1"]);
    expect((await game.p1.try((p) => p.play("diana", { to: "base" }))).ok).toBe(false);
    await game.p1.play("diana", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    await game.settle();
    // 2 (Scout) + 3 (Diana) = 5 defending Might vs 4: the Raider dies and bf1 stays P1's.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("diana")).toBe("bf1");
  });

  test("the whole card in one combat: Ambush in as a defender, then play a spell in the showdown → Diana fights at 5; a 6-Might attacker into Scout(2)+Diana(5) dies", async () => {
    const game = await ambushBoard().unit(P2, "base", { might: 6, name: "Brute" }, "brute").build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    await game.p1.play("diana", { to: "bf1" });
    // Diana is on the board now; P1 still acts in the showdown and casts the [Action] Trick.
    if (game.actingSeat() !== P1) {
      await game.p2.pass();
    }
    await game.p1.cast("trick");
    expect(game.state("diana").might).toBe(3); // trigger waits for the spell to resolve
    // drain the chain (Trick resolves → trigger → +2) but stop before combat damage to read her Might
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("trick")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("diana").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 7 defending Might ≥ 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("When YOU play a spell: +2 this turn once the spell resolves (3 → 5); a second spell stacks (→ 7); gone next turn (→ 3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "diana")
      .hand(P1, TRICK, "t1")
      .hand(P1, TRICK, "t2")
      .build();
    await game.p1.cast("t1");
    expect(game.state("diana").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 5 });
    await game.p1.cast("t2");
    await game.settle();
    expect(game.state("diana").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 3 });
  });

  test("the trigger is its own chain item sourced from Diana after the spell resolves", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "diana").hand(P1, TRICK, "t1").build();
    await game.p1.cast("t1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Trick resolves
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("diana").might).toBe(5);
  });

  test("negative space — an OPPONENT's spell is not 'you': P2 casts on their turn, Diana stays 3", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "diana").hand(P2, TRICK, "theirs").build();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("diana").might).toBe(3);
  });

  test("negative space — a COUNTERED spell was never played (359.3.e.10): Wind Wall on the Trick → no draw, no +2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", CARD, "diana")
      .hand(P1, TRICK, "t1")
      .hand(P2, WIND_WALL, "wall")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("t1");
    await game.p1.passPriority();
    await game.p2.cast("wall");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // no draw happened
    expect(game.state("diana").might).toBe(3);
  });

  test("negative space — playing a UNIT is not playing a spell; and Diana still in HAND gets nothing from a spell cast before she lands", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 1 } })
      .unit(P1, "base", CARD, "onBoard")
      .hand(P1, CARD, "inHand")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Acolyte" }, "acolyte")
      .hand(P1, TRICK, "t1")
      .build();
    await game.p1.play("acolyte");
    await game.settle();
    expect(game.state("onBoard").might).toBe(3);
    await game.p1.cast("t1");
    await game.settle();
    expect(game.state("onBoard").might).toBe(5);
    await game.p1.play("inHand", { to: "base" });
    await game.settle();
    expect(game.zoneOf("inHand")).toBe("base");
    expect(game.state("inHand").might).toBe(3); // the earlier spell did not see her
  });

  test("from the Champion Zone: 4 + [chaos] paid, lands in base; without the chaos pip it is not offered", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).champion(P1, CARD, "diana").build();
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("diana")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const noPip = await scenario().resources(P1, { energy: 4 }).champion(P1, CARD, "diana").build();
    expect(noPip.p1.can("playChampion")).toBe(false);
  });

  test("registry payload: champion unit, Diana tag, [chaos] pip, printed Ambush keyword + 'play-spell (controller) → +2 Might this turn to self' trigger", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, isChampion: true, might: 3, name: "Diana, No Longer Human", powerCost: ["chaos"], tags: ["Diana"] });
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      {
        effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
        trigger: { event: "play-spell", on: "controller" },
        type: "triggered",
      },
    ]);
  });
});
