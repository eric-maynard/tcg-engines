/**
 * Kharox — ven-114-166 · Unit · Chaos · 6 energy · 5 Might
 *
 *   [Empower] [6][chaos][chaos] ([6][chaos][chaos]: Empower me. Use only if not Empowered.)
 *   When I become [Empowered], choose an opponent. They [Burn 3]. Then you may do this: Choose a unit in
 *   their trash and play it, ignoring its cost. (To Burn 3, they put the top 3 cards of their Main Deck
 *   into their trash.)
 *
 * Head-judge notes — the tricky situations for THIS card:
 *   1. [Empower] is an ACTIVATED ability (827.1.c.1): pays 6 energy + 2 chaos up front, is a non-triggered
 *      chain item P2 may answer, only on my turn in an Open state (381), never while already Empowered.
 *      Killed in response → nothing on the board becomes Empowered (441.2), so no Burn either.
 *   2. "When I become [Empowered]" keys on the false→true edge from ANY source (441.2.a / 828.1.d): his own
 *      ability or Sanction; a redundant empower of an already-Empowered Kharox is no event (441.1.c).
 *   3. Burn 3 hits the OPPONENT's deck: exactly their top 3, in order, into THEIR trash; my deck untouched.
 *   4. "Then you may … choose a unit in THEIR trash and play it, ignoring its cost": any unit there — freshly
 *      burned or already trashed — never a spell, never a unit in MY trash. I play it: it enters under MY
 *      control (owner stays P2 — controller ≠ owner), exhausted, for 0 energy / 0 power. Declining is legal;
 *      with no unit in their trash after the burn there is simply nothing to play.
 *   5. Registry: the activated half is structured; the trigger's effect is an EMPTY sequence → the whole
 *      Burn / play-from-their-trash half is unimplemented (BUG tests below).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-114-166";
const SANCTION = "ven-035-166"; // Calm Reaction: mode 0 = Empower a unit (disempower at end of turn)
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit
const SPELL = { cardType: "spell", energyCost: 1, name: "Deck Spell" };
const BIG = { cardType: "unit", energyCost: 9, might: 8, name: "Big Burned Unit", powerCost: ["fury", "fury"] };
const KILL_SHOT = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill Shot",
  timing: "reaction",
};

/** Kharox in P1's base with [6][chaos][chaos] floating; P2's deck top→: Skulker "u1", a spell "s1", an expensive unit "u2", then "u4" (4th, must NOT burn); P2's trash already holds "old" (unit). */
function board(energy = 6, chaos = 2) {
  return scenario()
    .resources(P1, { energy, power: { chaos } })
    .unit(P1, "base", CARD, "kharox")
    .deckTop(P2, SKULKER, "u1")
    .deckTop(P2, SPELL, "s1")
    .deckTop(P2, BIG, "u2")
    .deckTop(P2, SKULKER, "u4")
    .trash(P2, SKULKER, "old")
    .trash(P1, SKULKER, "mineTrashed");
}

/** Answer P1's prompts: yes to opt-ins, P2 for a player choice, `wants` for picks (any order). */
async function drive(game: Game, wants: string[], optIn = true): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      return;
    }
    if (d.kind === "yes-no") {
      await (optIn ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick") {
      const seatOpt = d.options.find((o) => o.seatRef === P2 || o.key === P2);
      const want = wants.find((w) => d.options.some((o) => o.card === w || o.key === w));
      if (seatOpt) {
        await game.p1.answer({ keys: [seatOpt.key], kind: "pick" });
      } else if (want !== undefined) {
        wants.splice(wants.indexOf(want), 1);
        await game.p1.pick(want);
      } else if (!optIn && d.allowDecline) {
        await game.p1.decline();
      } else {
        return;
      }
    } else {
      return;
    }
  }
}

/** Cast Sanction and steer its mode-0 empower onto Kharox (single-option prompts may be auto-taken by settle). */
async function sanctionKharox(game: Game): Promise<void> {
  await game.p1.cast("sanc");
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const key = d.options.find((o) => o.card === "kharox" || o.key === "kharox")?.key ?? d.options.find((o) => o.key === "0")?.key;
    if (key === undefined) {
      return;
    }
    await game.p1.answer({ keys: [key], kind: "pick" });
  }
}

async function empowerAndResolve(game: Game, wants: string[], optIn = true): Promise<void> {
  await game.p1.activate("kharox");
  for (let i = 0; i < 4; i++) {
    await game.settle();
    await drive(game, wants, optIn);
  }
  await game.settle();
}

describe("Kharox (ven-114-166)", () => {
  test("registry payload: 6-cost 5-Might chaos unit; activated Empower [6][chaos][chaos] with a not-Empowered restriction; a 'become Empowered' self trigger", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 6, might: 5, name: "Kharox" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { energy: 6, power: ["chaos", "chaos"] }, effect: { target: "self", type: "empower" }, type: "activated" });
    expect(JSON.stringify((def?.abilities?.[0] as { restrictions: unknown }).restrictions)).toMatch(/while-empowered|not-empowered/);
    expect(def?.abilities?.[1]).toMatchObject({ trigger: { event: "empower", on: "self" }, type: "triggered" });
  });

  test("registry payload — the trigger's effect must encode Burn 3 on a chosen opponent, then an optional play-from-their-trash ignoring cost (not an empty sequence)", async () => {
    const trig = (await loadDefaultCardPool()).get(CARD)?.abilities?.[1] as { effect: { type: string; effects?: unknown[] } };
    const json = JSON.stringify(trig.effect);
    expect(trig.effect.effects?.length ?? 1).toBeGreaterThan(0);
    expect(json).toMatch(/"(mill|burn)"/);
    expect(json).toMatch(/"amount":3/);
    expect(json).toMatch(/trash/);
    expect(json).toMatch(/ignor/i);
  });

  test("play cost: 6 energy, no power; enters exhausted, 5 Might, not Empowered; 5 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "kharox").build();
    await game.p1.play("kharox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("kharox")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 5, zone: "base" });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kharox").build()).p1.can("play", "kharox")).toBe(false);
  });

  test("[Empower]: pays exactly [6][chaos][chaos] up front, is a NON-triggered chain item P2 may answer, resolves → Empowered; then a Kharox trigger goes on the chain", async () => {
    const game = await board(7, 3).build();
    await game.p1.activate("kharox");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: false })]);
    expect(game.state("kharox").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("kharox")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
  });

  test("negative space — 5 energy, only one chaos, already Empowered, or the opponent's turn: [Empower] is not offered", async () => {
    expect((await board(5, 2).build()).p1.can("activate", "kharox")).toBe(false);
    expect((await board(6, 1).build()).p1.can("activate", "kharox")).toBe(false);
    expect((await board(6, 2).build()).p1.can("activate", "kharox")).toBe(true);
    const already = await scenario().resources(P1, { energy: 6, power: { chaos: 2 } }).unit(P1, "base", CARD, "kharox", { empowered: true }).build();
    expect(already.p1.can("activate", "kharox")).toBe(false);
    const theirTurn = await board().active(P2).build();
    expect(theirTurn.p1.can("activate", "kharox")).toBe(false);
  });

  test("killed in response to his own [Empower]: resources stay spent, the trashed card is NOT Empowered, and P2's deck is untouched (no Burn)", async () => {
    const game = await board().hand(P2, KILL_SHOT, "shot").build();
    const p2Deck = game.p2.deck().length;
    await game.p1.activate("kharox");
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: "kharox" });
    await game.settle();
    expect(game.zoneOf("kharox")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("kharox").isEmpowered).toBe(false);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p2.trash().sort()).toEqual(["old", "shot"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("on becoming Empowered the opponent Burns exactly their top 3 (u1, s1, u2 → their trash); the 4th card stays on top; my deck is untouched", async () => {
    // Expected per 440.1. Actual: the trigger resolves as an empty sequence — nothing is burned.
    const game = await board().build();
    const myDeck = game.p1.deck().length;
    expect(game.p2.deck().slice(0, 4)).toEqual(["u1", "s1", "u2", "u4"]);
    await empowerAndResolve(game, [], false); // decline the "then you may"
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.p2.trash().sort()).toEqual(["old", "s1", "u1", "u2"].sort());
    expect(game.p2.deck()[0]).toBe("u4");
    expect(game.p1.deck()).toHaveLength(myDeck);
    expect(game.p1.units()).toEqual(["kharox"]); // declined → nothing played
  });

  test("'then you may' — play a freshly burned unit from THEIR trash ignoring its cost: the 9-cost [fury][fury] unit enters MY base, exhausted, under my control but still owned by P2, for free", async () => {
    const game = await board().build();
    await empowerAndResolve(game, ["u2"]);
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.state("u2")).toMatchObject({ controller: P1, isExhausted: true, might: 8, owner: P2 });
    expect(game.p1.units()).toContain("u2");
    expect(game.p2.units()).not.toContain("u2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // nothing beyond the Empower cost
    expect(game.p2.trash().sort()).toEqual(["old", "s1", "u1"].sort());
  });

  test("the pick offers exactly the UNITS in THEIR trash (old, u1, u2) — not the burned spell, not the unit in my own trash", async () => {
    const game = await board().build();
    await game.p1.activate("kharox");
    let offered: string[] | undefined;
    for (let i = 0; i < 8 && offered === undefined; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.seat !== P1) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.options.some((o) => o.card === "old" || o.key === "old")) {
        offered = d.options.map((o) => o.card ?? o.key);
      } else if (d.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]?.key as string], kind: "pick" }); // e.g. "choose an opponent"
      } else {
        break;
      }
    }
    expect(offered?.sort()).toEqual(["old", "u1", "u2"]);
  });

  test("a unit ALREADY in their trash before the burn ('old') is just as playable", async () => {
    const game = await board().build();
    await empowerAndResolve(game, ["old"]);
    expect(game.zoneOf("old")).toBe("base");
    expect(game.state("old")).toMatchObject({ controller: P1, might: 3, owner: P2 });
  });

  test("becoming Empowered from ANOTHER source (Sanction, mode 0) fires the same trigger — P2 burns 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "kharox")
      .deckTop(P2, SKULKER, "u1")
      .deckTop(P2, SPELL, "s1")
      .deckTop(P2, SKULKER, "u2")
      .hand(P1, SANCTION, "sanc")
      .build();
    await sanctionKharox(game);
    expect(game.state("kharox").isEmpowered).toBe(true);
    for (let i = 0; i < 4; i++) {
      await game.settle();
      await drive(game, [], false);
    }
    expect(game.p2.trash().sort()).toEqual(["s1", "u1", "u2"]);
  });

  test("negative space — Sanction on an ALREADY-Empowered Kharox is not 'becoming' Empowered (441.1.c): no trigger item, P2's deck untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "kharox", { empowered: true })
      .deckTop(P2, SKULKER, "u1")
      .hand(P1, SANCTION, "sanc")
      .build();
    const p2Deck = game.p2.deck().length;
    await sanctionKharox(game);
    expect(game.chain().some((i) => i.cardId === "kharox" && i.triggered)).toBe(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p2.trash()).toEqual([]);
  });
});
