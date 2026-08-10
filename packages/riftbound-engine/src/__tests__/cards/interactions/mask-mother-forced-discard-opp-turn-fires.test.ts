/**
 * Interaction: Mask Mother (ven-094-166) · Unit · Chaos · 3 · 3 Might
 *     "When you discard me, you may pay [1] to give a friendly unit +2 [Might] this turn."   — in P1's HAND
 *   × Bewitching Spirit (unl-121-219) · Unit · Chaos · 3 · 2 Might
 *     "When you play me, choose a player. They discard 1."                                    — in P2's hand
 *   (+ contrasts: Vengeance ogn-229-298 "Kill a unit."; Kennen ven-113-166 "When you play me, [Burn 2].";
 *      Divine Judgment ogn-244-298 "Each player chooses … 2 cards in their hands. Recycle the rest.")
 *
 * Question. Mask Mother's trigger lives on a card in HAND (a Private zone) and resolves off a hand→trash
 * move. (a) On P2's turn P2 plays Bewitching Spirit choosing P1; P1 (2 cards in hand) elects to discard
 * Mask Mother. Does "When you discard me" trigger although an ENEMY effect caused the discard on the
 * enemy's turn? Who controls it, when is the [1] paid, and can it pump a P1 unit mid-P2-turn? (b) 1 vs 0
 * energy floating. (c) Contrasts — killed on the board, recycled from hand, burned from deck; and P1
 * discarding the OTHER card. (d) Discarded while P1 controls no units.
 *
 * Rules: 422.1 (discard = hand → trash), 422.1.a (the discarding player picks, using private info),
 * 422.1.b / 383.2.c / 383.2.c.1 (trigger evaluated after the discard, source now in the Public trash),
 * 385.1 / 385.2 / 108.7.c (an off-board trigger self-describes its zone; nothing is "registered" while
 * she merely sits in hand), 191.4.a.1 (source in a non-board zone → controller = OWNER, P1), 383.3.c
 * (triggers go on the chain on any player's turn), 383.3.a / 383.3.a.2 / 383.3.b / 383.3.b.1 ("you may
 * pay [1] to …": decided and PAID at finalization; declined/unpayable → removed), 355.10 (the friendly
 * unit is a target, chosen at finalization), 317.2 ("this turn" expires in P2's Ending Phase).
 *
 * Expected: (a) YES — P1 is the discarding player; the trigger is P1's, pends during resolution of the
 * Spirit's play trigger and is finalized after it (chain then holds only Mask Mother's item); P1 pays
 * exactly 1 energy and names the friendly unit at finalization; P2 may respond; on resolution the unit is
 * +2 for the rest of P2's turn — enough to win a defence P2 then attacks into; gone at end of turn. Mask
 * Mother stays in P1's trash. (b) 0 energy: "yes" is not legal, the ability is removed, nothing charged.
 * (c) kill / recycle / burn / discarding a different card: no prompt, no chain item, no charge.
 * (d) no friendly unit → cannot be finalized → removed silently, P1 keeps the [1].
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_MOTHER = "ven-094-166";
const BEWITCHING_SPIRIT = "unl-121-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker — the "other" hand card / deck fodder
const VENGEANCE = "ogn-229-298"; // Order spell · 4 + [order][order] · "Kill a unit."
const KENNEN = "ven-113-166"; // Chaos unit · 3 + [chaos] · "When you play me, [Burn 2]."
const DIVINE_JUDGMENT = "ogn-244-298"; // Order spell · 7 + [order][order] · "… 2 cards in their hands. Recycle the rest."

/**
 * P2's turn (turn 2, main). P2: Bewitching Spirit in hand with exactly [3], a vanilla 3-Might "Raider" in
 * base. P1: Mask Mother + one filler in hand, `energy` floating (default 1), and `allies` vanilla units —
 * "ally" (2 Might) holding bf1, "ally2" (1 Might) in base.
 */
function board(opts: { energy?: number; allies?: 0 | 1 | 2 } = {}) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .resources(P1, { energy: opts.energy ?? 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, MASK_MOTHER, "mm")
    .hand(P1, FILLER, "other")
    .hand(P2, BEWITCHING_SPIRIT, "spirit");
  const n = opts.allies ?? 1;
  if (n >= 1) {
    b.unit(P1, "bf1", { might: 2, name: "Ally" }, "ally");
  }
  if (n >= 2) {
    b.unit(P1, "base", { might: 1, name: "Ally Two" }, "ally2");
  }
  return b;
}

/** P2 plays the Spirit, names P1 (mode 0 = "Opponent discards 1"), its trigger resolves → P1 is asked which card. */
async function spiritNamesP1(game: Game): Promise<void> {
  await game.p2.play("spirit", { to: "base" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "spirit" } });
  await game.p2.chooseMode(0);
  await game.settle(); // both pass → the play trigger resolves
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
}

/** …and P1 discards Mask Mother (not the filler). Stops at whatever comes next. */
async function p1DiscardsMaskMother(game: Game): Promise<void> {
  await spiritNamesP1(game);
  await game.p1.pick("mm");
  expect(game.zoneOf("mm")).toBe("trash");
}

describe("(a) forced discard by an ENEMY effect on the ENEMY's turn still fires 'When you discard me' — for P1", () => {
  test("Bewitching Spirit's 'THEY discard 1': the picker is P1 (422.1.a) and both of P1's hand cards are offered — P1 may choose Mask Mother", async () => {
    const game = await board().build();
    await spiritNamesP1(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["mm", "other"]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("discarding her (hand → P1's trash, 422.1) puts HER trigger on the chain controlled by P1 (191.4.a.1) — after the Spirit's trigger has left it (383.2.c) — and asks P1, not P2, the 'you may pay [1]' (383.3.a)", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    expect(game.p1.trash()).toContain("mm");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mm", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "spirit")).toBe(false);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "mm" } });
    expect(game.p1.energy()).toBe(1); // nothing paid before answering
    expect(game.turnPlayer()).toBe(P2); // 383.3.c — any player's turn
  });

  test("accepting PAYS the [1] at finalization (383.3.b.1) and locks the target then (355.10): energy 1 → 0 immediately, chain item shows targets [ally], still unresolved (ally still 2)", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mm", controller: P1, targets: ["ally"], triggered: true })]);
    expect(game.state("ally").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("with two friendly units the recipient is CHOSEN at finalization (before anyone gets priority): only P1's units are offered — never P2's Raider/Spirit, never Mask Mother herself", async () => {
    const game = await board({ allies: 2 }).build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "mm" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "ally2"]);
    await game.p1.pick("ally2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mm", targets: ["ally2"] })]);
    await game.settle();
    expect(game.state("ally2").might).toBe(3);
    expect(game.state("ally").might).toBe(2);
  });

  test("P2 may respond to the finalized trigger: after P1 passes, P2 holds priority with Mask Mother's item still on the chain", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mm"]);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
  });

  test("resolution mid-P2-turn: Ally is 4 (2 + 2), Mask Mother stays in P1's trash (not returned), P2 is back in its open Main Phase; nothing of P2's changed", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    await game.settle();
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.p1.hand()).toEqual(["other"]);
    expect(game.state("raider").might).toBe(3);
    expect(game.state("spirit")).toMatchObject({ might: 2, zone: "base" });
    expect(game.p2.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("the pump matters on P2's turn: P2's 3-Might Raider attacking the now-4-Might Ally at bf1 dies; Ally survives and P1 keeps bf1", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    await game.settle();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });

  test("'this turn' = P2's turn: the +2 expires in P2's Ending Phase (317.2) — on P1's next turn Ally is 2 again", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ally").might).toBe(2);
  });

  test("declining (383.3.a.2): nothing paid, nobody buffed, item removed, Mask Mother still in the trash", async () => {
    const game = await board().build();
    await p1DiscardsMaskMother(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally").might).toBe(2);
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});

describe("(b) 1 energy vs 0 energy floating", () => {
  test("0 energy: the prompt (if shown) advertises 'yes' as NOT acceptable, an attempted yes is rejected, and after 'no' the item is gone — energy 0, Ally 2, Mask Mother in trash (383.3.a.2, 383.3.b.1)", async () => {
    const game = await board({ energy: 0 }).build();
    await p1DiscardsMaskMother(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d).toMatchObject({ canAccept: false, seat: P1, source: { cardId: "mm" } });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ally").might).toBe(2);
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("1 energy: exactly that 1 ENERGY is spent (no power touched) and the buff lands", async () => {
    const game = await board({ energy: 1 }).resources(P1, { power: { chaos: 2 } }).build();
    await p1DiscardsMaskMother(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2 } });
    expect(game.state("ally").might).toBe(4);
  });
});

describe("(c) contrasts — only a hand → trash DISCARD triggers her (422.1)", () => {
  test("P1 discards the OTHER card instead: Mask Mother stays in hand and nothing of hers triggers — no prompt, empty chain, [1] unspent (385.1 / 108.7.c: nothing is 'armed' while she sits in hand)", async () => {
    const game = await board().build();
    await spiritNamesP1(game);
    await game.p1.pick("other");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.zoneOf("mm")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally").might).toBe(2);
  });

  test("KILLED on the board (board → trash via P2's Vengeance) is not a discard: she lands in the trash with no prompt and no charge", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .resources(P1, { energy: 1 })
      .unit(P1, "base", MASK_MOTHER, "mm")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.cast("veng", { targets: "mm" });
    await game.settle();
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally").might).toBe(2);
  });

  test("RECYCLED from hand (hand → deck via P2's Divine Judgment; P1 keeps the two fillers) is not a discard: she goes to the Main Deck, no prompt, no charge", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { order: 2 } })
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, MASK_MOTHER, "mm")
      .hand(P1, FILLER, "keep1")
      .hand(P1, FILLER, "keep2")
      .hand(P2, DIVINE_JUDGMENT, "dj")
      .build();
    await game.p2.cast("dj");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("mm"); // the one card (of three) P1 does NOT keep
    await game.settle();
    expect(game.zoneOf("mm")).toBe("mainDeck");
    expect(game.p1.trash()).not.toContain("mm");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally").might).toBe(2);
  });

  test("BURNED from the deck (deck → trash via Kennen's [Burn 2]) is not a discard: she is in the trash, no prompt, no charge", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } }) // 3 + [chaos] for Kennen, 1 spare for a would-be [1]
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .deck(P1, [MASK_MOTHER, FILLER], ["mm", "under"])
      .hand(P1, KENNEN, "kennen")
      .build();
    await game.p1.play("kennen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.zoneOf("under")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.state("ally").might).toBe(2);
  });
});

describe("(d) discarded while P1 controls NO units", () => {
  test("the trigger cannot be finalized without a legal 'friendly unit' target → removed: no prompt for P1, chain empty, the [1] is NOT charged, she stays in the trash; P2 simply continues its turn", async () => {
    const game = await board({ allies: 0 }).build();
    await p1DiscardsMaskMother(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
