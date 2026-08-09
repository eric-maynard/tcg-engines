/**
 * Rabadon's Deathcrown — sfd-191-221 · Gear (Equipment) · Calm/Mind · 4 energy + 2 power · +3 Might bonus
 *
 *   [Unique] (Your deck can have only 1 card with this name.)
 *   [Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)
 *
 * Rules: 825 (Unique is a DECK-CONSTRUCTION constraint — 825.3.a one card of that name per deck — and
 * 825.4 has no effect during gameplay), 135.2.e.6.c (a [C] pip on a two-Domain card is one power of
 * EITHER of its Domains — here calm|mind — never a third Domain; universal power added as [A] still pays
 * anything, 135.2.e.5.b), 818 (Equip: activated, chain, attach on resolution), 151.2 (timing), 434.1.d
 * (+3 while attached), 819 (Quick-Draw via Jax, Unmatched: Reaction-speed play that attaches on play,
 * no Equip cost), 143.2.a (lethal = damage ≥ Might).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Both costs are HYBRID: play = 4 energy + two calm|mind pips (calm+mind, 2 calm, 2 mind, or
 *     universal power all pay; two FURY do not); Equip = one calm|mind pip (fury is not offered).
 *  2. Unique does nothing on the table: if two Deathcrowns ARE on the board (scenario / copy effects),
 *     both attach — even to the same unit for +6. The only teeth are in deck validation: a 40-card deck
 *     with two of them must be rejected.
 *  3. +3 is the biggest printed bonus in the set: on Gearhead ("double its base Might bonus") it is +6.
 *  4. Jax, Unmatched gives it Quick-Draw: played from hand at Reaction speed on the OPPONENT's turn it
 *     attaches at once for just its play cost — a 3-Might unit facing 5 damage becomes 6 and lives.
 *  5. Standard Equip discipline still applies: enemy units never, no showdown, no opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";
import { validateDeck } from "../../validators/deck-validators";

const CARD = "sfd-191-221";
const GEARHEAD = "sfd-068-221"; // 3 Might · Each Equipment attached to me gives double its base Might bonus
const JAX_UNMATCHED = "sfd-054-221"; // 5 Might · Deflect · Your Equipment everywhere have [Quick-Draw]
const FIRE_BELOW = "sfd-189-221"; // Calm/Mind legend (Ornn) — Deathcrown is his Signature card
const ORNN_BLACKSMITH = "sfd-058-221"; // Calm champion unit (Ornn)
const BOLT5 = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt 5",
  rulesText: "[Action] Deal 5 to a unit.",
  timing: "action",
};

/** P1's turn: Deathcrown unattached in base, 2-Might Squire, enemy 4-Might Guard at P2's bf1, `power` floating. */
function board(power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .gear(P1, CARD, "crown");
}

const inHand = (energy: number, power: Record<string, number>) => scenario().resources(P1, { energy, power }).hand(P1, CARD, "crown").build();
const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
const equip = (game: Game, unitId = "squire", equipmentId = "crown") => game.p1.choose("equipCard:-", { params: { equipmentId, unitId } });

describe("Rabadon's Deathcrown (sfd-191-221)", () => {
  test("registry payload: 4-energy Calm/Mind equipment with two hybrid pips, +3 bonus, and exactly two abilities — the Unique keyword and [Equip] costed one [rainbow]-spelled (hybrid) pip", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: ["calm", "mind"], energyCost: 4, mightBonus: 3, name: "Rabadon's Deathcrown" });
    expect(def?.powerCost).toEqual(["rainbow", "rainbow"]);
    expect(def?.abilities).toEqual([
      { keyword: "Unique", type: "keyword" },
      { cost: { power: ["rainbow"] }, keyword: "Equip", type: "keyword" },
    ]);
    const game = await board().build();
    expect(game.state("crown").keywords).toEqual(expect.arrayContaining(["Unique", "Equip"]));
  });

  test("PLAY: 4 energy + one calm + one mind are all spent; it lands unattached in base and the Squire is still 2", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1, mind: 1 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "crown").build();
    await game.p1.play("crown");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, mind: 0 } });
    await game.settle();
    expect(game.state("crown")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("squire").might).toBe(2);
  });

  test("PLAY pips are hybrid calm|mind (135.2.e.6.c): 2 calm, 2 mind or 2 universal pay; 2 FURY do not; 3 energy or a single pip is short", async () => {
    expect((await inHand(4, { calm: 2 })).p1.can("play", "crown")).toBe(true);
    expect((await inHand(4, { mind: 2 })).p1.can("play", "crown")).toBe(true);
    expect((await inHand(4, { rainbow: 2 })).p1.can("play", "crown")).toBe(true);
    expect((await inHand(4, { fury: 2 })).p1.can("play", "crown")).toBe(false);
    expect((await inHand(3, { calm: 1, mind: 1 })).p1.can("play", "crown")).toBe(false);
    expect((await inHand(4, { calm: 1 })).p1.can("play", "crown")).toBe(false);
    expect((await inHand(4, { body: 1, calm: 1 })).p1.can("play", "crown")).toBe(false);
  });

  test("EQUIP: one calm|mind pip (energy untouched), a chain item P2 may answer, then +3 on resolution — Squire 2 → 5", async () => {
    const game = await board({ mind: 1 }).resources(P1, { energy: 4 }).build();
    await equip(game);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crown", controller: P1 })]);
    expect(game.state("squire").might).toBe(2);
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    await game.p2.pass();
    expect(game.state("crown").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["crown"], baseMight: 2, isBuffed: false, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("EQUIP pip colours: calm pays, mind pays, universal pays — fury (a third Domain) is not even offered, nor is energy alone", async () => {
    for (const power of [{ calm: 1 }, { mind: 1 }, { rainbow: 1 }]) {
      const game = await board(power).build();
      expect(equipOption(game)).toBeDefined();
      await equip(game);
      expect(game.p1.power()).toBe(0);
    }
    expect(equipOption(await board({ fury: 3 }).build())).toBeUndefined();
    expect(equipOption(await board({}).resources(P1, { energy: 9 }).build())).toBeUndefined();
  });

  test("825.4 Unique has no gameplay effect: two Deathcrowns on the board both equip — onto the SAME Squire for 2 + 3 + 3 = 8", async () => {
    const game = await board({ calm: 1, mind: 1 }).gear(P1, CARD, "crown2").build();
    await equip(game, "squire", "crown");
    await game.settle();
    await equip(game, "squire", "crown2");
    await game.settle();
    expect(game.state("squire").attachments.sort()).toEqual(["crown", "crown2"]);
    expect(game.state("squire").might).toBe(8);
    expect(game.p1.resources().power).toEqual({ calm: 0, mind: 0 });
  });

  // BUG — expected (825.3.a): a deck containing two cards named "Rabadon's Deathcrown" is illegal. Actual: the
  // deck validator only enforces the generic 3-per-name limit (103.2.b) and never reads the Unique keyword,
  // so the two-Deathcrown deck validates clean.
  // rule 103.2.d.2: the Deathcrown is an Ornn Signature card, so the shell must be an Ornn deck —
  // in an Ahri deck it is illegal for a different reason (SIGNATURE_TAG_MISMATCH).
  test("825.3.a deck construction — a legal 40-card Ornn (Calm/Mind) deck becomes ILLEGAL with a second Deathcrown; one copy is fine", async () => {
    const pool = await loadDefaultCardPool();
    const crown = pool.get(CARD)!;
    const legend = pool.get(FIRE_BELOW)!;
    const champion = pool.get(ORNN_BLACKSMITH)!;
    const seen = new Set<string>();
    const playables = pool
      .all()
      .filter((c) => (c.cardType === "unit" || c.cardType === "spell") && (c.domain === "calm" || c.domain === "mind") && c.isChampion !== true && (c.tags ?? []).length === 0)
      .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
    const filler = playables.slice(0, 13).flatMap((c) => [c, c, c]); // 39 cards, 3-ofs
    const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "calm")!;
    const battlefields = pool.all().filter((c) => c.cardType === "battlefield").slice(0, 3);
    const deck = (main: unknown[]) =>
      validateDeck({ battlefields, chosenChampion: champion, legend, mainDeck: main, runeDeck: Array.from({ length: 12 }, () => rune) } as never);
    expect(deck([crown, ...filler])).toEqual({ errors: [], valid: true });
    const two = deck([crown, crown, ...filler.slice(0, 38)]);
    expect(two.valid).toBe(false);
    expect(JSON.stringify(two.errors)).toContain("Rabadon's Deathcrown");
  });

  test("holders and timing: only P1's Squire is offered; nothing on the opponent's turn or during a showdown", async () => {
    const game = await board().build();
    expect(equipOption(game)?.fields.find((f) => f.name === "unitId")?.options).toEqual(["squire"]);
    expect((await game.p1.try(() => equip(game, "guard"))).ok).toBe(false);
    expect(equipOption(await board().active(P2).build())).toBeUndefined();
    const sd = await board().battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "open");
    expect(equipOption(sd)).toBeUndefined();
  });

  test("partner — Gearhead doubles the BASE bonus: the Deathcrown is +6 there (3 → 9)", async () => {
    const game = await scenario().resources(P1, { power: { mind: 1 } }).unit(P1, "base", GEARHEAD, "gearhead").gear(P1, CARD, "crown").build();
    await equip(game, "gearhead");
    await game.settle();
    expect(game.state("gearhead")).toMatchObject({ attachments: ["crown"], might: 9 });
  });

  test("partner — Jax, Unmatched (Quick-Draw, 819): on P2's turn, in response to a 5-damage bolt at my 3-Might Squire, I play the Deathcrown from HAND for its play cost only; it attaches at once, Squire is 6 and survives the 5", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { calm: 1, mind: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", JAX_UNMATCHED, "jax")
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .hand(P1, CARD, "crown")
      .hand(P2, BOLT5, "bolt")
      .build();
    expect(game.state("crown").keywords).toContain("Quick-Draw");
    await game.p2.cast("bolt", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    const opt = game.p1.legal().find((o) => o.card === "crown" && (o.verb === "equip" || o.verb === "play"));
    expect(opt).toBeDefined();
    await game.p1.choose(opt!.key, {}, { answers: ["squire"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } }); // play cost only — no Equip pip on top
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("squire");
      } else if (d?.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("crown").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ damage: 5, might: 6, zone: "base" });
  });

  test("the +3 in real combat: the crowned Squire (5) attacks the 4-Might Guard, kills it, survives (4 < 5) and conquers with the Deathcrown along", async () => {
    const game = await board().build();
    await equip(game);
    await game.settle();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.locationOf("crown")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
