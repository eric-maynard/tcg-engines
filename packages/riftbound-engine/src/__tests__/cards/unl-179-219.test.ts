/**
 * Rift Herald — unl-179-219 · Unit · Order · 8 energy + [order] · 7 Might
 *
 *   When I move to a battlefield, look at the top 3 cards of your Main Deck. You may reveal a unit
 *   from among them and draw it. Recycle the rest.
 *   [Deathknell][>] Play a unit from your hand to your base, ignoring its Energy cost. (When I die,
 *   get the effect. You must still pay its Power cost.)
 *
 * Rules: 383.4 / 445 ("when I MOVE to a battlefield" — a Standard Move (or any move) whose destination
 * is a battlefield; moving back to base is not it, and being PLAYED to a battlefield is not a move),
 * look / reveal-and-pick ("you MAY reveal a UNIT": unit-only, optional; "recycle the rest" = bottom of
 * the Main Deck, 416.1.a; nothing is trashed), 808 (Deathknell = when I die), 356.1.b ("ignoring its
 * Energy cost" waives energy only — Power pips are still paid; unaffordable power → not a candidate),
 * 143.4 (the played unit enters the base exhausted) and 383.4.a (it WAS played → its own "When you
 * play me" triggers fire), 464.2.e (a move into an enemy battlefield puts the look on the combat chain,
 * resolving before damage).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Look discipline: exactly 3 seen; only UNITS among them may be taken (a gear/spell never); the take
 *     is optional; the 2 (or 3) rejects go to the BOTTOM, the old 4th card is the new top.
 *  2. What is a "move to a battlefield": base → bf yes (open or enemy-held); bf → base no; played
 *     straight onto a battlefield no.
 *  3. One action, three abilities in sequence: Herald moves into a 7-Might defender → look resolves
 *     first (decline) → combat trades both → Deathknell → a unit comes down from hand for free energy.
 *  4. Deathknell economics: Demacian Diplomat (2 energy, no power) lands with 0 energy in the pool and
 *     its own play trigger grants XP; Sinister Poro (2+[chaos]) needs the chaos pip — paid if present,
 *     not even a candidate if absent; a hand of spells yields nothing.
 *  5. Cost: 8+[order] exactly; 7 energy or no order pip → unplayable.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-179-219";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const SNAX = "sfd-046-221"; // Poro Snax — gear
const CLEAVE = "ogn-004-298"; // spell
const DIPLOMAT = "unl-092-219"; // Body unit 2 (no power): When you play me, gain 1 XP.
const SINISTER_PORO = "unl-137-219"; // Chaos unit 2+[chaos], 1 Might

/** Herald ready in base, bf1 open, known deck top: unit, gear, unit, spell, unit, … */
function moveBoard() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", CARD, "herald")
    .deck(P1, [SKULKER, SNAX, SKULKER, CLEAVE, SKULKER, SKULKER], ["u1", "gear2", "u3", "spell4", "u5", "u6"]);
}

const offered = (d: unknown) => ((d as PickDecision | null)?.kind === "pick" ? (d as PickDecision).options.map((o) => o.card) : []);

/** Drain until P1 faces a non-action prompt (the look / the Deathknell pick). */
async function toPrompt(game: Game): Promise<PickDecision> {
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as PickDecision;
}

describe("Rift Herald (unl-179-219)", () => {
  test("cost: 8 energy + 1 order; enters the base exhausted as a 7-Might unit with no play effect; 7 energy or no order pip → unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { order: 1 } }).hand(P1, CARD, "herald").build();
    await game.p1.play("herald");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("herald")).toMatchObject({ baseMight: 7, isExhausted: true, might: 7, zone: "base" });
    expect(game.state("herald").keywords).toContain("Deathknell");
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 7, power: { order: 3 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
    expect((await scenario().resources(P1, { energy: 12 }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
  });

  test("moving base → open bf1 puts the look trigger on the chain; taking u3 draws it, u1+gear2 go to the BOTTOM, spell4 is the new top; the Herald still conquers bf1", async () => {
    const game = await moveBoard().build();
    const deckSize = game.p1.deck().length;
    await game.p1.move("herald", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    const d = await toPrompt(game);
    expect(d.semantics).toBe("from-revealed");
    expect(offered(d)).toEqual(expect.arrayContaining(["u1", "u3"]));
    expect(offered(d)).not.toContain("spell4"); // only 3 are looked at
    await game.p1.pick("u3");
    await game.settle();
    expect(game.p1.hand()).toEqual(["u3"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize - 1);
    expect(deck[0]).toBe("spell4");
    expect([...deck.slice(-2)].sort()).toEqual(["gear2", "u1"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // Expected: "you may reveal a UNIT from among them" — the gear (Poro Snax) in the top 3 is never a
  // legal take; only u1/u3 are offered and picking gear2 is refused. Actual: the hand-written `look`
  // ability carries no unit filter, so all three looked-at cards (gear included) are offered.
  test("the look offers ONLY the units among the top 3 — the gear is not a legal take (printed 'reveal a unit')", async () => {
    const game = await moveBoard().build();
    await game.p1.move("herald", "bf1");
    const d = await toPrompt(game);
    expect(offered(d).sort()).toEqual(["u1", "u3"]);
    expect((await game.p1.try((p) => p.pick("gear2"))).ok).toBe(false);
    expect(game.p1.hand()).toEqual([]);
  });

  // Expected: "you MAY reveal a unit … and draw it" — declining is legal; then all 3 looked-at cards
  // are recycled (bottom), hand stays empty, deck size unchanged. Actual: the hand-written `look`
  // carries no `optional`, so the reveal-and-pick demands a take and "decline" is rejected.
  test("'you may' — declining the take must be legal: nothing drawn, all 3 recycled to the bottom, spell4 on top", async () => {
    const game = await moveBoard().build();
    const deckSize = game.p1.deck().length;
    await game.p1.move("herald", "bf1");
    const d = await toPrompt(game);
    expect(d.allowDecline).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize);
    expect(deck[0]).toBe("spell4");
    expect([...deck.slice(-3)].sort()).toEqual(["gear2", "u1", "u3"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // Expected: with gear/spell/gear on top no card is a legal take (unit-only); after declining, all 3
  // go under and u4 is the new top. Actual: no unit filter — the gear g1 is happily "drawn".
  test("no unit among the top 3 (gear, spell, gear) — nothing may be drawn, all 3 go under, u4 becomes the top", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "herald")
      .deck(P1, [SNAX, CLEAVE, SNAX, SKULKER], ["g1", "s2", "g3", "u4"])
      .build();
    await game.p1.move("herald", "bf1");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // At most a decline-only prompt: no non-unit may be taken.
      for (const bad of ["g1", "s2", "g3"]) {
        expect((await game.p1.try((p) => p.pick(bad))).ok).toBe(false);
      }
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("u4");
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["g1", "g3", "s2"]);
  });

  test("negative space — moving battlefield → BASE is not 'to a battlefield': no chain item, no prompt, deck untouched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "herald")
      .deck(P1, [SKULKER, SNAX, SKULKER], ["u1", "gear2", "u3"])
      .build();
    const top = game.p1.deck().slice(0, 3);
    await game.p1.move("herald", "base");
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.p1.deck().slice(0, 3)).toEqual(top);
    expect(game.p1.hand()).toEqual([]);
  });

  test("negative space — being PLAYED to a battlefield you control is not a move: no look trigger, deck untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, CARD, "herald")
      .deck(P1, [SKULKER, SNAX, SKULKER], ["u1", "gear2", "u3"])
      .build();
    const top = game.p1.deck().slice(0, 3);
    await game.p1.play("herald", { to: "bf1" });
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("herald")).toBe("battlefield-bf1");
    expect(game.p1.deck().slice(0, 3)).toEqual(top);
  });

  test("into an enemy-held battlefield: the look resolves on the combat chain BEFORE damage (draw u1), then the 7-Might Herald kills the 4-Might Guard and conquers", async () => {
    const game = await moveBoard().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 4, name: "Guard" }, "guard").build();
    await game.p1.move("herald", "bf2");
    await toPrompt(game);
    expect(game.zoneOf("guard")).toBe("battlefield-bf2"); // no damage yet
    await game.p1.pick("u1");
    expect(game.p1.hand()).toEqual(["u1"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("herald")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("three abilities off one move: into a 7-Might Wall → look (take u1) → both die → Deathknell plays Demacian Diplomat (not the drawn Skulker we leave, not the spell) to base for 0 energy, exhausted, and ITS play trigger grants 1 XP", async () => {
    const game = await moveBoard()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 7, name: "Wall" }, "wall")
      .hand(P1, DIPLOMAT, "dip")
      .hand(P1, CLEAVE, "aSpell")
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("herald", "bf2");
    await toPrompt(game); // the look
    await game.p1.pick("u1");
    expect(game.zoneOf("wall")).toBe("battlefield-bf2"); // still no combat damage
    // Combat: 7 vs 7 → both die → Deathknell asks which hand UNIT to play (the spell is not a candidate;
    // both units are: the Diplomat costs only energy, the Skulker costs only energy).
    const d = await toPrompt(game);
    expect(offered(d).sort()).toEqual(["dip", "u1"]);
    await game.p1.pick("dip");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("dip")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.energy()).toBe(0); // energy cost ignored, pool never went negative
    expect(game.p1.xp()).toBe(1); // "When you play me" fired: it WAS played
    expect(game.p1.hand().sort()).toEqual(["aSpell", "u1"]);
    expect(game.p1.points()).toBe(0); // nobody left at bf2
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("Deathknell still charges POWER: Sinister Poro (2+[chaos]) comes down with the chaos pip paid and energy untouched; the Deathknell also works when the Herald dies DEFENDING on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "herald")
      .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
      .hand(P1, SINISTER_PORO, "poro")
      .build();
    await game.p2.move("raider", "bf1");
    const d = await toPrompt(game);
    expect(offered(d)).toEqual(["poro"]);
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("negative space — Deathknell with the power unaffordable or no unit in hand: 0 chaos → the Poro is no candidate, nothing is played, energy untouched; a hand of only spells → no prompt at all", async () => {
    /** P2 raids bf1 with a 7-Might Raider; the defending Herald dies without ever moving (no look). */
    const raid = (hand: string, resources: { energy: number; power?: Record<string, number> }) =>
      scenario()
        .active(P2)
        .resources(P1, resources)
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", CARD, "herald")
        .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
        .hand(P1, hand, "held");

    const noChaos = await raid(SINISTER_PORO, { energy: 9 }).build();
    await noChaos.p2.move("raider", "bf1");
    const r1 = await noChaos.settle();
    if (r1.reason === "unanswered" && noChaos.decision()?.kind === "pick") {
      expect(offered(noChaos.decision())).not.toContain("held");
      expect((await noChaos.p1.try((p) => p.pick("held"))).ok).toBe(false);
      await noChaos.p1.decline();
      await noChaos.settle();
    }
    expect(noChaos.zoneOf("herald")).toBe("trash");
    expect(noChaos.zoneOf("held")).toBe("hand");
    expect(noChaos.p1.resources()).toEqual({ energy: 9, power: {} });
    expect(noChaos.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });

    const spellsOnly = await raid(CLEAVE, { energy: 9, power: { fury: 1 } }).build();
    await spellsOnly.p2.move("raider", "bf1");
    const r2 = await spellsOnly.settle();
    expect(r2.reason).toBe("open"); // no Deathknell prompt: a spell is never "a unit from your hand"
    expect(spellsOnly.zoneOf("herald")).toBe("trash");
    expect(spellsOnly.zoneOf("held")).toBe("hand");
    expect(spellsOnly.p1.resources()).toEqual({ energy: 9, power: { fury: 1 } });
    expect(spellsOnly.violations()).toEqual([]);
  });

  // Expected: the registry mirrors the printed text — a move-to-battlefield trigger whose look is
  // unit-filtered and optional (draw the pick, recycle the rest), plus the Deathknell (keyword and
  // die-trigger) playing a unit from hand to base ignoring ENERGY only. Actual: the look is a bare
  // `{ amount: 3, from: "deck", type: "look" }` with no unit filter and no optionality.
  test("registry payload — the look ability lacks the unit filter / optional flag the printed 'you may reveal a unit' demands", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 8, might: 7, name: "Rift Herald" });
    expect(def?.powerCost).toEqual(["order"]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(3);
    const play = { from: "hand", ignoreCost: "energy", target: { type: "unit" }, toLocation: "base", type: "play" };
    expect(abilities[1]).toEqual({ effect: play, keyword: "Deathknell", type: "keyword" });
    expect(abilities[2]).toEqual({ effect: play, trigger: { event: "die", on: "self" }, type: "triggered" });
    expect(abilities[0]).toMatchObject({
      effect: { amount: 3, filter: { cardTypes: ["unit"] }, from: "deck", optional: true, type: "look" },
      trigger: { event: "move-to-battlefield", on: "self" },
      type: "triggered",
    });
  });
});
