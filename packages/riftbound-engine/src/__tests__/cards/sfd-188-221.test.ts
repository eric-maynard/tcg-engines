/**
 * Void Rush — sfd-188-221 · Spell · Fury/Order · 2 energy + 1 power ([rainbow] in the engine)
 *
 *   Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost
 *   by [2]. Draw any you didn't banish.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - REVEAL (424) is public, and it is a reveal FROM A DECK — so a Void Hatchling (sfd-018, "if you
 *    would reveal cards from a deck, look at the top card first…") intercepts it; a private "look"
 *    would not. The two revealed cards stay in the deck until picked/drawn (424.1.a.2).
 *  - "You may banish one, then play it": optional; either card type (unit → board exhausted, spell →
 *    goes on the chain and needs its own targets). "reducing its cost by [2]" is an ENERGY discount
 *    (356.4): 3 → 1, 1 → 0 (never below 0), a Power cost is untouched and must still be paid, and a
 *    card you still cannot afford after the discount can never reach the board this way (419.2.a).
 *  - "Draw any you didn't banish": exactly the un-picked revealed card(s) — one if you banished, both
 *    if you declined; the third card of the deck is the new top either way.
 *  - Short deck (431.1.c): one card left → reveal one, banish/play it or draw it, no Burn Out.
 *  - Standard timing (no [Action]); cost 2 + one power of any domain; unaffordable short of either.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-188-221";
const FAEFOLK = "ogn-075-298"; // unit, 7 energy, 6 Might → 5 after the discount
const SKULKER = "ogn-175-298"; // unit, 3 energy, 3 Might → 1 after the discount
const CLEAVE = "ogn-004-298"; // [Action] spell, 1 energy: give a unit Assault 3 this turn → 0 after the discount
const ENFORCER = "sfd-123-221"; // unit, 3 energy + [chaos] → 1 + [chaos]
const HATCHLING = "sfd-018-221"; // If you would reveal cards from a deck, look at the top card first. You may recycle it. Then reveal.
const FILLER = "ogn-175-298";

/** P1 with `energy` + one rainbow, Void Rush in hand, deck = [top, second, third, …]. */
function board(energy: number, deck: [string, string, string] = [FAEFOLK, SKULKER, FILLER]) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 1 } })
    .deck(P1, deck, ["top", "second", "third"])
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, CARD, "vr");
}

/** Cast Void Rush and pass priority until the revealed-cards prompt (or an open state). */
async function castToReveal(game: Game): Promise<Decision | null> {
  await game.p1.cast("vr");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

/** After a pick: answer a unit's location prompt with the base and pass priority until open. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.some((o) => o.key === "base")) {
      await game.seat(d.seat).pick("base");
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      return;
    }
  }
}

describe("Void Rush (sfd-188-221)", () => {
  test("cost: 2 energy + 1 power; one spell item on the chain; unaffordable without the power or at 1 energy; standard timing (not on the opponent's turn)", async () => {
    const game = await board(2).build();
    await game.p1.cast("vr");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vr", controller: P1, triggered: false })]);
    expect((await scenario().resources(P1, { energy: 5 }).deck(P1, [SKULKER, SKULKER]).hand(P1, CARD, "vr").build()).p1.can("cast", "vr")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { rainbow: 2 } }).deck(P1, [SKULKER, SKULKER]).hand(P1, CARD, "vr").build()).p1.can("cast", "vr")).toBe(false);
    expect((await board(2).active(P2).build()).p1.can("cast", "vr")).toBe(false);
  });

  test("resolution: exactly the top TWO cards are offered (optional pick); banish+play the 3-cost Skulker for 1, DRAW the other (Faefolk); third card is the new top; spell → trash", async () => {
    const game = await board(3).build(); // 3 - 2 (Void Rush) = 1 left = Skulker's discounted cost
    const d = (await castToReveal(game)) as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    // Both top cards are revealed, but only the PAYABLE one is a legal banish-and-play choice
    // (419.2.a): Faefolk would still cost 7 − 2 = 5 with 1 energy left. With 7 energy both are offered.
    expect(d.options.map((o) => o.card)).toEqual(["second"]);
    const rich = (await castToReveal(await board(7).build())) as PickDecision;
    expect(rich.options.map((o) => o.card)).toEqual(["top", "second"]);
    expect(d.allowDecline).toBe(true); // "You may"
    expect(game.zoneOf("top")).toBe("mainDeck"); // revealed cards are still in the deck (424.1.a.2)
    await game.p1.pick("second");
    await finish(game);
    expect(game.p1.energy()).toBe(0); // paid 3 - 2 = 1
    expect(game.zoneOf("second")).toBe("base");
    expect(game.state("second")).toMatchObject({ isExhausted: true, might: 3 }); // a played unit enters exhausted
    expect(game.p1.hand()).toEqual(["top"]); // "Draw any you didn't banish"
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.banishment()).toEqual([]); // it was played out of banishment
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining: nothing is banished or played and BOTH revealed cards are drawn", async () => {
    const game = await board(9).build();
    await castToReveal(game);
    await game.p1.decline();
    await finish(game);
    expect(game.p1.hand().sort()).toEqual(["second", "top"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.base()).toEqual(["buddy"]);
    expect(game.p1.energy()).toBe(7); // only Void Rush was paid for
  });

  test("the discount is only [2]: the 7-cost Faefolk costs 5 — with 5 left it is played; with 4 left it can NOT reach the board (419.2.a), nothing extra is spent, and the other card is still drawn", async () => {
    const rich = await board(7).build(); // 7 - 2 = 5 left
    await castToReveal(rich);
    await rich.p1.pick("top");
    await finish(rich);
    expect(rich.zoneOf("top")).toBe("base");
    expect(rich.p1.energy()).toBe(0);
    expect(rich.p1.hand()).toEqual(["second"]);

    const poor = await board(6).build(); // 6 - 2 = 4 left < 5
    const d = (await castToReveal(poor)) as PickDecision;
    if (d.options.some((o) => o.card === "top")) {
      const r = await poor.p1.try((p) => p.pick("top"));
      if (r.ok) {
        await finish(poor);
      }
    }
    if (poor.decision()?.kind === "pick") {
      await poor.p1.decline();
      await finish(poor);
    }
    expect(poor.zoneOf("top")).not.toBe("base"); // never played for less than 5
    expect(poor.zoneOf("top")).not.toBe("chain");
    expect(poor.p1.energy()).toBe(4); // nothing more was spent
    expect(poor.p1.hand()).toContain("second"); // "Draw any you didn't banish" happens regardless
    expect(poor.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the discount floors at 0 and a SPELL may be the pick: Cleave (1 → 0) is played onto the chain, resolves on the chosen unit, ends in the trash; the other card is drawn", async () => {
    const game = await board(2, [CLEAVE, SKULKER, FILLER]).build(); // 0 energy left after Void Rush
    await castToReveal(game);
    await game.p1.pick("top");
    // Cleave needs a target: answer whatever prompt asks for it, then let it resolve.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick") {
        const buddy = d.options.find((o) => o.card === "buddy") ?? d.options[0];
        await game.p1.answer({ keys: [buddy?.key as string], kind: "pick" });
      } else {
        throw new Error(`unexpected ${d.kind}: ${d.prompt}`);
      }
    }
    expect(game.p1.energy()).toBe(0); // 1 - 2 → 0, not negative, nothing owed
    expect(game.zoneOf("top")).toBe("trash"); // a resolved spell goes to the trash, not back to banishment
    expect(game.state("buddy").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.p1.hand()).toEqual(["second"]);
    expect(game.p1.deck()[0]).toBe("third");
  });

  test("Power costs are not discounted: Corrupt Enforcer (3+[chaos]) costs 1 + [chaos] — playable with a chaos power, not without", async () => {
    const withChaos = await board(3, [ENFORCER, SKULKER, FILLER]).resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } }).build();
    await castToReveal(withChaos);
    await withChaos.p1.pick("top");
    await finish(withChaos);
    expect(withChaos.zoneOf("top")).toBe("base");
    expect(withChaos.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(withChaos.p1.hand()).toEqual(["second"]);

    const noChaos = await board(3, [ENFORCER, SKULKER, FILLER]).build();
    const d = (await castToReveal(noChaos)) as PickDecision;
    if (d.options.some((o) => o.card === "top")) {
      const r = await noChaos.p1.try((p) => p.pick("top"));
      if (r.ok) {
        await finish(noChaos);
      }
    }
    expect(noChaos.zoneOf("top")).not.toBe("base");
    expect(noChaos.p1.energy()).toBe(1);
  });

  test("short deck (431.1.c): with ONE card left only that card is revealed; declining draws it; no Burn Out", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 3, power: { rainbow: 1 } }) // 1 left so the lone Skulker (3 − 2) is a payable, hence offered, choice
      .deck(P1, [SKULKER], ["last"])
      .deck(P2, [FILLER, FILLER])
      .hand(P1, CARD, "vr")
      .build();
    const d = await castToReveal(game);
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).toEqual(["last"]);
      await game.p1.decline();
    }
    await finish(game);
    expect(game.p1.hand()).toEqual(["last"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("short deck: the lone revealed card may still be banished and played (Skulker for 1); nothing is left to draw", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .deck(P1, [SKULKER], ["last"])
      .deck(P2, [FILLER, FILLER])
      .hand(P1, CARD, "vr")
      .build();
    await castToReveal(game);
    await game.p1.pick("last");
    await finish(game);
    expect(game.zoneOf("last")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.isOver()).toBe(false);
  });

  test.failing("BUG: Void Hatchling interplay (sfd-018) — Void Rush REVEALS from a deck, so its controller must first look at/recycle the top card and then see the NEXT two; the engine runs it as a private look and skips the replacement", async () => {
    // Expected: with a Hatchling on P1's board, a look/recycle prompt precedes the reveal; recycling
    // "top" makes the offered pair [second, third]. Actual: Void Rush is executed as a private look,
    // the reveal replacement never applies and [top, second] are offered straight away.
    const game = await board(9).unit(P1, "base", HATCHLING, "vh").build();
    await game.p1.cast("vr");
    let sawHatchling = false;
    let offered: (string | undefined)[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no" && d.seat === P1) {
        sawHatchling = true;
        await game.p1.yes(); // recycle the top card
      } else if (d.kind === "pick" && d.seat === P1) {
        if (d.semantics === "from-revealed" && d.options.length >= 2) {
          offered = d.options.map((o) => o.card);
          await game.p1.decline();
        } else {
          sawHatchling = true; // a one-card look/recycle pick
          await game.p1.pick(d.options[0]?.key as string);
        }
      }
    }
    expect(sawHatchling).toBe(true);
    expect(offered).toEqual(["second", "third"]);
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.hand().sort()).toEqual(["second", "third"]);
  });

  test("parsed abilities: one standard-speed spell ability — REVEAL 2 from deck, optional banish→play at −[2] energy, draw the rest; cost 2 + 1 power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, name: "Void Rush" });
    expect(def?.powerCost).toHaveLength(1);
    expect(def?.timing ?? "standard").toBe("standard");
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; effect: Record<string, unknown> };
    expect(ab.type).toBe("spell");
    expect(ab.effect).toMatchObject({ amount: 2, from: "deck", onPicked: "play", onRest: "draw", optional: true, reduceCost: { energy: 2 } });
  });

  test("parsed effect is a public REVEAL (424; what Void Hatchling keys off)", async () => {
    // Expected: the effect is a reveal (type "reveal", or a look flagged public/reveal). Actual: a plain private `look`.
    const pool = await loadDefaultCardPool();
    const ab = pool.get(CARD)?.abilities?.[0] as { effect: { type: string } & Record<string, unknown> };
    const e = ab.effect;
    const isReveal = e.type === "reveal" || e.reveal === true || e.public === true || e.visibility === "public";
    expect(isReveal).toBe(true);
  });
});
