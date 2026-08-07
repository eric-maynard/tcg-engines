/**
 * Show of Strength — sfd-106-221 · Spell · Body · 2 energy + [body] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Draw 1 for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. The count is YOUR units on the board (base + battlefields) with EFFECTIVE Might ≥ 5 (708/710):
 *      exactly 5 counts, 4 does not; buffs, "+N this turn" and Equipment bonuses count; damage never
 *      lowers Might; enemy Mighty units and Mighty cards in your hand/trash do not count.
 *   2. Counted on RESOLUTION, not when cast: kill the only Mighty unit in response → draws 0; cast it
 *      in response to a kill spell → it resolves first and still draws.
 *   3. Zero Mighty units: still castable (no targets involved), resolves drawing nothing.
 *   4. [Reaction] timing: legal on the opponent's turn while a chain is open, and inside showdowns.
 *   5. Cost: 2 energy AND one body power — either missing → not castable; spell ends in the trash.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-106-221";
const CHEF = "sfd-092-221"; // Combat Chef — 5 might (Mighty on its own)
const BLADE = "sfd-095-221"; // Doran's Blade — Equipment +2
const KILL_SHOT = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Kill Shot",
  timing: "reaction",
} as const;
const SLOW_BOLT = { ...KILL_SHOT, abilities: [{ ...KILL_SHOT.abilities[0], timing: "action" }], name: "Slow Bolt", timing: "action" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 5, name: "Five" }, "five") // Mighty (exactly 5)
    .unit(P1, "bf1", { might: 6, name: "Six" }, "six", { damage: 5 }) // Mighty, damage irrelevant
    .unit(P1, "base", { might: 4, name: "Four" }, "four") // not Mighty
    .unit(P2, "base", { might: 8, name: "TheirGiant" }, "giant") // enemy — never counts
    .hand(P1, { cardType: "unit", energyCost: 7, might: 7, name: "BigInHand" }, "inHand") // not on board
    .hand(P1, CARD, "sos");
}

describe("Show of Strength (sfd-106-221)", () => {
  test("parsed ability: a Reaction spell drawing 1 per friendly Mighty unit; cost 2 + [body]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 2, name: "Show of Strength", timing: "reaction" });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toEqual([
      {
        effect: { amount: { count: { controller: "friendly", filter: "mighty", quantity: "all", type: "unit" } }, type: "draw" },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("costs 2 energy + 1 body; draws 2 (Five and damaged Six count; Four, the enemy Giant and the 7 in hand do not); → trash", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("sos");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sos", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1 + 2); // BigInHand + 2 drawn
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("not castable without the body power or with only 1 energy", async () => {
    expect((await board().resources(P1, { energy: 2, power: { body: 0 } }).build()).p1.can("cast", "sos")).toBe(false);
    expect((await board().resources(P1, { energy: 1, power: { body: 1 } }).build()).p1.can("cast", "sos")).toBe(false);
  });

  test("zero Mighty units: still castable, resolves, draws nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 4 }, "four")
      .unit(P2, "base", { might: 9 }, "theirs")
      .hand(P1, CARD, "sos")
      .build();
    expect(game.p1.can("cast", "sos")).toBe(true);
    await game.p1.cast("sos");
    await game.settle();
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });

  test("effective Might counts (710): a buffed 4 (→5) and an equipped Combat Chef (5+2) are both Mighty → draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 4, name: "Buffed" }, "buffed", { buffed: true })
      .unit(P1, "base", CHEF, "chef", { equippedWith: ["blade"] })
      .gear(P1, BLADE, "blade", { attachedTo: "chef" })
      .hand(P1, CARD, "sos")
      .build();
    expect(game.state("buffed").might).toBe(5);
    expect(game.state("chef").might).toBe(7);
    await game.p1.cast("sos");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("counted on resolution: the opponent kills my only Mighty unit in response → Show of Strength draws 0", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 5, name: "Five" }, "five")
      .hand(P1, CARD, "sos")
      .hand(P2, KILL_SHOT, "shot")
      .build();
    await game.p1.cast("sos");
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: "five" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sos", "shot"]);
    await game.settle(); // shot resolves first (LIFO), Five dies, then sos counts 0
    expect(game.zoneOf("five")).toBe("trash");
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });

  test("[Reaction] on the opponent's turn: cast in response to their kill spell, it resolves first and still draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 5, name: "Five" }, "five")
      .hand(P1, CARD, "sos")
      .hand(P2, SLOW_BOLT, "bolt")
      .build();
    expect(game.p1.can("cast", "sos")).toBe(false); // opponent's open state: no priority for P1 yet
    await game.p2.cast("bolt", { targets: "five" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "sos")).toBe(true);
    await game.p1.cast("sos");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "sos"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // drew while Five was still alive
    expect(game.zoneOf("five")).toBe("trash"); // then the bolt landed
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] inside a showdown on the opponent's turn (defender with Focus): counts Mighty units anywhere on my board", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 6, name: "Reserve" }, "reserve")
      .unit(P2, "base", { might: 3, name: "Poker" }, "poker")
      .hand(P1, CARD, "sos")
      .build();
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "sos")).toBe(true);
    await game.p1.cast("sos");
    await game.settle(); // spell resolves, then combat: 5 vs 3 → Poker dies
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'this turn' pumps count while they last: +might modifier makes a 3 Mighty now, but not after the turn passes", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 3, name: "Pumped" }, "pumped", { mightModifier: 2 })
      .hand(P1, CARD, "sos")
      .hand(P1, CARD, "sos2")
      .build();
    expect(game.state("pumped").might).toBe(5);
    await game.p1.cast("sos");
    await game.settle();
    expect(game.p1.hand()).toEqual(["sos2", expect.any(String)]);
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1: the modifier expired; hand = sos2 + 1 drawn earlier + 1 draw phase
    expect(game.state("pumped").might).toBe(3);
    const handBefore = game.p1.hand().length;
    await game.p1.do("addResources", { energy: 2, power: { body: 1 } });
    await game.p1.cast("sos2");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // sos2 left, nothing drawn
    expect(game.violations()).toEqual([]);
  });
});
