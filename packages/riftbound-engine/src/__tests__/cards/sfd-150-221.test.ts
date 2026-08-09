/**
 * Last Rites — sfd-150-221 · Gear (Equipment) · Chaos · 3 energy (no power) · +2 Might bonus
 *
 *   [Equip] — [chaos], Recycle 2 cards from your trash (Pay the cost: Attach this to a unit you control.)
 *
 * Rules: 818.1.c.3 (an Equip cost may combine resource and NON-resource costs), 416.3 (Recycle as a
 * COST: the action must be completable — fewer than 2 cards in the trash → the ability cannot be
 * activated at all), 416.1.a/416.5 (recycled Main Deck cards go to the BOTTOM of their owner's Main
 * Deck), 416.6 ("Recycle 2 from your trash": the payer chooses which 2; not targeting), 377.3/357 (costs
 * are paid when the ability is finalized to the chain, before anyone can respond, and are never refunded
 * if the attach fizzles), 821.1.c.3 (Weaponmaster shaves only the [rainbow]-payable POWER pip — the
 * Recycle-2 portion of the cost is still paid in full), 434.1.d (+2 while attached).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The trash count is a hard gate: 0 or 1 card in trash → no [Equip] however much chaos floats;
 *     exactly 2 → both go; 3 → the payer picks two and the third stays.
 *  2. Both halves of the cost leave at ACTIVATION: chaos pip gone AND trash down by two while the item
 *     still sits on the chain unattached, with P2 holding priority. Kill the holder in response and the
 *     recycled cards stay on the bottom of the deck.
 *  3. Recycled cards go to the bottom of P1's MAIN DECK (deck +2, trash −2) — not banished, not to hand.
 *  4. Master Bingwen (Chaos Weaponmaster): the [chaos] pip is waived so no power is needed, but he must
 *     still recycle 2 — with only one card in the trash Last Rites is not on offer.
 *  5. Enemy trash never counts ("your trash").
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-150-221";
const MASTER_BINGWEN = "sfd-127-221"; // 6 energy · 6 Might · Chaos · Weaponmaster
const SKULKER = "ogn-175-298"; // vanilla filler for the trash
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  rulesText: "[Reaction] Deal 3 to a unit.",
  timing: "reaction",
};

/** P1's turn: Last Rites unattached, a 2-Might Squire, `trash` Skulkers in P1's trash (t1..tn), 2 in P2's trash, `power` floating. */
function board(trash: number, power: Record<string, number> = { chaos: 1 }) {
  const b = scenario()
    .resources(P1, { power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, CARD, "rites")
    .trash(P2, SKULKER, "theirs1")
    .trash(P2, SKULKER, "theirs2");
  for (let i = 1; i <= trash; i++) {
    b.trash(P1, SKULKER, `t${i}`);
  }
  return b;
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
const equip = (game: Game, unitId = "squire") => game.p1.choose("equipCard:-", { params: { equipmentId: "rites", unitId } });

/** Answer a "which cards to recycle" prompt (if the engine asks) with `keys`. */
async function answerRecycle(game: Game, keys: string[]): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const wanted = keys.filter((k) => d.options.some((o) => (o.card ?? o.key) === k));
    await game.p1.pick(...(wanted.length > 0 ? wanted.slice(0, Math.max(1, d.max)) : [d.options[0]!.key]));
  }
}

describe("Last Rites (sfd-150-221)", () => {
  test("registry payload: 3-cost Chaos equipment, +2 bonus; [Equip] costed one [chaos] pip PLUS recycle 2, then the Effect Text trigger", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "chaos", energyCost: 3, mightBonus: 2, name: "Last Rites" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { power: ["chaos"], recycle: 2 }, keyword: "Equip", type: "keyword" });
    // rule 718.3 / 724: the Effect Text becomes a triggered ability on the bearer once attached
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { from: "trash", target: { type: "unit" }, type: "play" },
      optional: true,
      trigger: { event: "conquer-or-hold", on: "self" },
      type: "triggered",
    });
    expect(def?.abilities).toHaveLength(2);
  });

  test("PLAY: exactly 3 energy, no power, no trash requirement — it lands unattached in base with an EMPTY trash; 2 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "rites").build();
    await game.p1.play("rites");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("rites")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.trash()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 2 } }).hand(P1, CARD, "rites").build()).p1.can("play", "rites")).toBe(false);
  });

  test("416.3 hard gate: with 0 or 1 card in MY trash the [Equip] is not offered at all (P2's full trash is irrelevant); with 2 it is", async () => {
    expect(equipOption(await board(0).build())).toBeUndefined();
    expect(equipOption(await board(1).build())).toBeUndefined();
    expect(equipOption(await board(2).build())).toBeDefined();
    // …and the chaos pip is still required on top of the trash: 2 in trash but only fury floating → no.
    expect(equipOption(await board(2, { fury: 2 }).build())).toBeUndefined();
    expect(equipOption(await board(2, { rainbow: 1 }).build())).toBeDefined(); // universal power pays [chaos]
  });

  test("attaches for +2 once it resolves: Squire 2 → 4, chaos spent, energy untouched", async () => {
    const game = await board(2).resources(P1, { energy: 2 }).build();
    await equip(game);
    await answerRecycle(game, ["t1", "t2"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    await game.settle();
    await answerRecycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["rites"], baseMight: 2, might: 4 });
  });

  // BUG — expected (818.1.c.3 / 416.1.a): paying the Equip cost recycles two cards — trash 2 → 0, both
  // Skulkers on the bottom of P1's main deck. Actual: the equipCard move deducts only the [chaos] pip; the
  // Recycle-2 half of the cost is checked for payability but never paid, so the trash is untouched.
  test("exactly two in trash — both are recycled to the BOTTOM of P1's main deck as the cost is paid (trash 0, deck +2)", async () => {
    const game = await board(2).build();
    const deckBefore = game.p1.deck().length;
    await equip(game);
    await answerRecycle(game, ["t1", "t2"]);
    await game.settle();
    await answerRecycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckBefore + 2);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
    expect(game.p2.trash().sort()).toEqual(["theirs1", "theirs2"]); // "your trash" only
  });

  // BUG — same root cause: no recycle prompt is ever raised on the plain [Equip] path.
  test("three in trash — the payer CHOOSES which two (416.6): t1 + t3 go under the deck, t2 stays in the trash", async () => {
    const game = await board(3).build();
    await equip(game);
    await answerRecycle(game, ["t1", "t3"]);
    await game.settle();
    await answerRecycle(game, ["t1", "t3"]);
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("squire");
    expect(game.p1.trash()).toEqual(["t2"]);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t3"]);
  });

  // BUG — expected (377.3 / 357): the whole cost is paid at activation, so while the item waits on the chain
  // with P2 holding priority the trash is ALREADY empty; P2 bolting the Squire in response fizzles the attach
  // (355.8) and nothing is refunded — cards stay under the deck, chaos stays spent. Actual: trash never moves.
  test("cost timing — trash is emptied before P2 can respond; killing the holder in response leaves the cards recycled, the pip spent and Last Rites unattached in base", async () => {
    const game = await board(2).resources(P2, { energy: 1 }).hand(P2, BOLT3, "bolt").build();
    await equip(game);
    await answerRecycle(game, ["t1", "t2"]);
    if (game.decision()?.seat === P1 && game.decision()?.kind === "action") {
      await game.p1.pass();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rites"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.power("chaos")).toBe(0);
    await game.p2.cast("bolt", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("rites")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.trash()).toEqual(["squire"]);
    expect(game.zoneOf("t1")).toBe("mainDeck");
  });

  test("partner — Master Bingwen (Weaponmaster, 821.1.c.3): the [chaos] pip is waived so NO power is needed, but Recycle 2 is still paid — he picks t1 + t3, they go under the deck, t2 stays, Bingwen is 8", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .gear(P1, CARD, "rites")
      .trash(P1, SKULKER, "t1")
      .trash(P1, SKULKER, "t2")
      .trash(P1, SKULKER, "t3")
      .hand(P1, MASTER_BINGWEN, "bingwen")
      .build();
    await game.p1.play("bingwen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const offer = game.decision();
    expect(offer).toMatchObject({ kind: "pick", seat: P1 });
    expect(offer?.kind === "pick" ? offer.options.map((o) => o.card ?? o.key) : []).toEqual(["rites"]);
    await game.p1.pick("rites");
    const recycle = game.decision();
    expect(recycle).toMatchObject({ kind: "pick", seat: P1 });
    expect(recycle?.kind === "pick" ? recycle.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["t1", "t2", "t3"]);
    await answerRecycle(game, ["t1", "t3"]);
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("bingwen");
    expect(game.state("bingwen").might).toBe(8);
    expect(game.p1.trash()).toEqual(["t2"]);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t3"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("partner negative space — Bingwen with only ONE card in the trash: Last Rites is not on offer (416.3), nothing attaches, the lone card stays", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 2 } }).gear(P1, CARD, "rites").trash(P1, SKULKER, "t1").hand(P1, MASTER_BINGWEN, "bingwen").build();
    await game.p1.play("bingwen");
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).not.toContain("rites");
    await game.settle();
    expect(game.state("rites").attachedTo).toBeUndefined();
    expect(game.state("bingwen").might).toBe(6);
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.p1.power("chaos")).toBe(2);
  });

  test("holders and timing: only P1's units are offered; nothing on the opponent's turn or inside a showdown", async () => {
    const game = await board(2).build();
    const units = (equipOption(game)?.fields.find((f) => f.name === "unitId")?.options ?? []) as string[];
    expect(units).toEqual(["squire"]);
    expect(equipOption(await board(2).active(P2).build())).toBeUndefined();
    const sd = await board(2).battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "open");
    expect(equipOption(sd)).toBeUndefined();
  });

  test("the +2 in real combat: the equipped Squire (4) walks into the 3-Might Guard, kills it, survives (3 < 4) and conquers with Last Rites riding along", async () => {
    const game = await board(2).build();
    await equip(game);
    await answerRecycle(game, ["t1", "t2"]);
    await game.settle();
    await answerRecycle(game, ["t1", "t2"]);
    await game.settle();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.locationOf("rites")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
