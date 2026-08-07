/**
 * Ornn, Blacksmith — sfd-058-221 · Unit (Champion · Ornn) · Calm · 5 energy + [calm] · 5 might
 *
 *   When you play me or when I hold, look at the top 4 cards of your Main Deck. You may
 *   reveal a gear from among them and draw it. Then recycle the rest.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Two trigger conditions on ONE ability: play-self (from hand OR from the Champion Zone,
 *      355.10.a.1) and Hold (383.4.d: Ornn must be AT the held battlefield in your Beginning Phase).
 *   2. "You may reveal a GEAR": units/spells among the 4 are never eligible; Equipment IS gear
 *      (150.4); the choice is optional and made on resolution (383.3.a.3 cites this very card) —
 *      the trigger always goes on the chain even if you intend to decline.
 *   3. "draw it … recycle the rest": the picked gear goes to hand; the other looked-at cards go to
 *      the BOTTOM of the Main Deck (416.1.a) so the former 5th card is the new top; nothing is trashed.
 *   4. Empty/short cases: no gear among the 4 → nothing to pick, all 4 recycled, hand unchanged;
 *      fewer than 4 cards in the deck → look at what is there, no Burn Out (431.1.c).
 *   5. Only YOUR hold, only where Ornn is: Ornn in base while another unit holds → no look; the
 *      opponent's Beginning Phase → nothing.
 *   6. Cost: 5 energy AND one calm power; either missing → not playable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-058-221";
const SNAX = "sfd-046-221"; // Poro Snax — Gear
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment (a gear, 150.4)
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla unit
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Cantrip",
  timing: "action",
} as const;

/** Ornn in hand with 5+[calm]; deck (top first): unit, Snax(gear), Dirk(equipment), spell, then "fifth". */
function inHand() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .hand(P1, CARD, "ornn")
    .deck(P1, [FILLER, SNAX, DIRK, CANTRIP, FILLER], ["u1", "snax", "dirk", "spell", "fifth"]);
}

describe("Ornn, Blacksmith (sfd-058-221)", () => {
  test("parsed ability: ONE triggered ability on play-self OR hold that looks at 4 from the deck", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, isChampion: true, might: 5, name: "Ornn, Blacksmith", tags: ["Ornn"] });
    expect(def?.powerCost).toEqual(["calm"]);
    const abilities = (def?.abilities ?? []) as { type: string; trigger?: unknown; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { amount: 4, from: "deck", type: "look" }, trigger: { event: "play-self-or-hold", on: "self" }, type: "triggered" });
  });

  test("cost: 5 energy + 1 calm; the play trigger goes on the chain; unaffordable without the calm or with 4 energy", async () => {
    const game = await inHand().build();
    await game.p1.play("ornn");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("ornn")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ornn", controller: P1, triggered: true })]);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "o").build()).p1.can("play", "o")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "o").build()).p1.can("play", "o")).toBe(false);
  });

  test("play trigger: reveals from exactly the top 4; picking the Equipment draws it, the other 3 go to the bottom, 'fifth' is the new top", async () => {
    const game = await inHand().build();
    const deckSize = game.p1.deck().length;
    await game.p1.play("ornn");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("fifth"); // only 4 are looked at
    expect(offered).toEqual(expect.arrayContaining(["dirk"]));
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.p1.hand()).toEqual(["dirk"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize - 1);
    expect(deck[0]).toBe("fifth");
    expect([...deck.slice(-3)].sort()).toEqual(["snax", "spell", "u1"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: only GEAR may be revealed — the unit and the spell among the top 4 must not be offered (Snax + Dirk only)", async () => {
    // Expected options: snax, dirk. Actual: all four looked-at cards (u1, snax, dirk, spell) are pickable.
    const game = await inHand().build();
    await game.p1.play("ornn");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = (d?.kind === "pick" ? d.options.map((o) => o.card) : []).sort();
    expect(offered).toEqual(["dirk", "snax"]);
  });

  test.failing("BUG: 'you MAY reveal' — the pick is declinable; declining recycles all 4 and draws nothing (383.3.a.3)", async () => {
    // Expected: allowDecline true; after decline hand is empty, fifth on top, 4 cards on the bottom.
    // Actual: a mandatory min-1 pick.
    const game = await inHand().build();
    await game.p1.play("ornn");
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("fifth");
    expect([...game.p1.deck().slice(-4)].sort()).toEqual(["dirk", "snax", "spell", "u1"]);
  });

  test.failing("BUG: no gear among the top 4 → nothing can be drawn; all 4 are recycled and the hand stays empty", async () => {
    // Expected: either no prompt or a decline-only prompt; end state: hand [], top = g5, bottom 4 = the units.
    // Actual: a mandatory pick forces a NON-gear card into hand.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .hand(P1, CARD, "ornn")
      .deck(P1, [FILLER, FILLER, FILLER, FILLER, SNAX], ["u1", "u2", "u3", "u4", "g5"])
      .build();
    await game.p1.play("ornn");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("g5");
    expect([...game.p1.deck().slice(-4)].sort()).toEqual(["u1", "u2", "u3", "u4"]);
  });

  test("short deck (2 cards): looks at both, no Burn Out (431.1.c) — picking the gear draws it and recycles the other", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .hand(P1, CARD, "ornn")
      .fillDecks(false)
      .deck(P1, [SNAX, FILLER], ["snax", "u1"])
      .build();
    await game.p1.play("ornn");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect((d?.kind === "pick" ? d.options.map((o) => o.card) : [])).toContain("snax");
    await game.p1.pick("snax");
    await game.settle();
    expect(game.p1.hand()).toEqual(["snax"]);
    expect(game.p1.deck()).toEqual(["u1"]);
    expect(game.p2.points()).toBe(0); // nobody burned out
    expect(game.p1.trash()).toEqual([]);
  });

  test.failing("BUG: playing Ornn from the Champion Zone is still 'playing me' (355.10.a.1) — the look trigger must fire", async () => {
    // Expected: after playChampion the triggered ability is on the chain / a reveal pick appears.
    // Actual: cost is paid and Ornn lands in base, but no trigger at all.
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .champion(P1, CARD, "ornn")
      .deck(P1, [FILLER, SNAX, DIRK, CANTRIP, FILLER], ["u1", "snax", "dirk", "spell", "fifth"])
      .build();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("ornn")).toBe("base");
    const triggered = game.chain().some((i) => i.cardId === "ornn" && i.triggered);
    await game.settle();
    expect(triggered || game.decision()?.kind === "pick").toBe(true);
    await game.p1.pick("snax");
    await game.settle();
    expect(game.p1.hand()).toEqual(["snax"]);
  });

  test("When I hold: Ornn at a battlefield you keep through your Beginning Phase → hold point + trigger on the chain → pick a gear (+ draw-phase card)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ornn")
      .deck(P1, [FILLER, SNAX, DIRK, CANTRIP, FILLER], ["u1", "snax", "dirk", "spell", "fifth"])
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ornn", controller: P1, triggered: true })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("snax");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    // Snax drawn by Ornn, then the draw phase draws the new top card ("fifth" — the other 3 went to the bottom).
    expect([...game.p1.hand()].sort()).toEqual(["fifth", "snax"]);
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["dirk", "spell", "u1"]);
    expect(game.p1.runes()).toHaveLength(2); // channel phase still happened
  });

  test("no hold trigger when Ornn sits in base while another unit holds (only the hold point + the draw-phase card)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "grunt")
      .unit(P1, "base", CARD, "ornn")
      .deck(P1, [FILLER, SNAX, DIRK, CANTRIP, FILLER], ["u1", "snax", "dirk", "spell", "fifth"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual(["u1"]); // plain draw of the untouched top card
    expect(game.p1.deck()[0]).toBe("snax");
  });

  test("only YOUR hold: nothing happens (no point, no look) across the opponent's Beginning Phase", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ornn")
      .deck(P1, [FILLER, SNAX], ["u1", "snax"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("u1");
  });

  test("not a hold if the battlefield is lost before your Beginning Phase: conquered by P2 → no trigger for Ornn's owner", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ornn", { damage: 0 })
      .unit(P2, "base", { might: 9, name: "Giant" }, "giant")
      .deck(P1, [FILLER, SNAX], ["u1", "snax"])
      .build();
    await game.p2.move("giant", "bf1");
    await game.settle(); // combat: 9 vs 5 → Ornn dies, P2 conquers
    expect(game.zoneOf("ornn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["u1"]);
    expect(game.violations()).toEqual([]);
  });
});
