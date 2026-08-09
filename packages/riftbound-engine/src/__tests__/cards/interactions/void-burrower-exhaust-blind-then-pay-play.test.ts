/**
 * Interaction: Void Burrower (sfd-187-221) · Legend (Rek'Sai) · Fury/Order
 *     "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may
 *      banish one, then play it. Recycle the rest."
 *   × Rek'Sai, Breacher (sfd-029-221) · Champion Unit · Fury · 3 · 3 Might
 *     "[Accelerate] … [Assault] … Friendly units played from anywhere other than a player's hand have
 *      [Accelerate]."
 *   revealed cards: "Big Void" (inline vanilla unit, 5 energy, 5 Might) on top of "Skitter" (inline
 *   vanilla FURY unit, 1 energy, 1 Might), then "third".
 *
 * Rules: 383.3.a / 740.4.a.2 (a LEADING "you may [cost] to …" is the opt-in + base cost, decided and paid
 * at finalization), 383.3.b / 383.3.b.1 / 404.1 (cost paid in step 4 to finalize), 406.4 (opponents react
 * after finalization, before resolution), 383.3.a.2 (declined at finalization → removed), 383.3.a.3 /
 * 740.4.a.2.a (a LATER "you may" is decided on resolution), 404.2 (unpayable cost → no item), 419.3.b
 * (a Limited play follows every normal step — incl. determining and paying the full cost; this card
 * prints no "ignoring its cost"), 356.2.b.1 + 805 (Accelerate = optional additional [1][C] declared and
 * paid during THAT play), 357 / 358.5 / 444.2.a (unpaid cost → the play is undone), 355.2 (a unit is
 * played to base or a battlefield you control).
 *
 * Q: P1 (Void Burrower, Rek'Sai in base) conquers with 1 energy + 1 fury floating.
 *  (a) Which "you may" is finalization vs resolution? Is the legend exhausted before P1 sees the cards,
 *      and does P2 get a window in between?  → exhaust = blind finalization cost; P2 reacts after the
 *      exhaust and before the reveal; "banish one" is chosen on resolution.
 *  (b) Must P1 pay to play the chosen card? Banishing the unaffordable 5-cost?  → full cost; and since
 *      the text is "banish one, then PLAY it" (not "then you may play it") the play is mandatory, so a
 *      card P1 cannot pay for is not an eligible pick at all (419.2.a / 419.3.c) — nothing is banished.
 *  (c) Banishing the 1-cost: where can it go, does Rek'Sai give it Accelerate, can P1 add [1][fury]?
 *      → base or any controlled battlefield (incl. the fresh conquest); yes (non-hand play); only with
 *      2 energy + 1 fury — with 1+1 it enters exhausted (or P1 plays nothing).
 *  (d) Legend already exhausted → no prompt; and no line exists where P1 peeks then declines.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_BURROWER = "sfd-187-221";
const REKSAI_BREACHER = "sfd-029-221";
const BIG_VOID = { cardType: "unit", energyCost: 5, might: 5, name: "Big Void" } as const;
const SKITTER = { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Skitter" } as const;
const THIRD = { cardType: "unit", energyCost: 3, might: 1, name: "Third Card" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. Legend Void Burrower (ready unless `legendExhausted`), Rek'Sai in base (unless `noReksai`),
 * a 2-Might Tunneler in base to walk onto P2's EMPTY bf1, P1 already controls bfHome (held by a
 * 2-Might Holder). Deck top → bottom: Big Void, Skitter, Third Card, filler…  Pool: `energy` + `fury`.
 */
function board(opts: { energy?: number; fury?: number; legendExhausted?: boolean; noReksai?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: opts.energy ?? 1, power: { fury: opts.fury ?? 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bfHome", { controller: P1 })
    .unit(P1, "bfHome", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Tunneler" }, "walker")
    .deck(P1, [BIG_VOID, SKITTER, THIRD], ["big", "skitter", "third"]);
  if (!opts.noReksai) {
    s.unit(P1, "base", REKSAI_BREACHER, "reksai");
  }
  if (opts.legendExhausted) {
    s.card("vb", { def: VOID_BURROWER, meta: { exhausted: true }, owner: P1, zone: "legendZone" });
  } else {
    s.legend(P1, VOID_BURROWER, "vb");
  }
  return s;
}

/** Tunneler walks onto the empty bf1; both pass focus in the non-combat showdown → P1 conquers (+1). */
async function conquer(game: Game): Promise<Decision | null> {
  await game.p1.move("walker", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.acting().passFocus();
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game.decision();
}

/** conquer → "yes" (exhaust) → both pass priority → the revealed-cards pick. */
async function toRevealPick(game: Game): Promise<Pick> {
  await conquer(game);
  await game.p1.yes();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "vb" } });
  return d as Pick;
}

/** From the reveal pick: banish Skitter, place it at `to`, answer the Accelerate offer per `accelerate`, drain to the open state. */
async function playSkitter(game: Game, to: string, accelerate: boolean): Promise<{ accelOffered?: boolean }> {
  const out: { accelOffered?: boolean } = {};
  await game.p1.pick("skitter");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(to);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      out.accelOffered = d.canAccept !== false;
      await (accelerate && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "action" && d.passKey) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return out;
}

const cardsOf = (d: Pick) => d.options.map((o) => o.card ?? o.key);

describe("Void Burrower × Rek'Sai, Breacher — blind exhaust at finalization, then a full-cost (Accelerate-able) play from banishment", () => {
  // ── (a) which "you may" is when ─────────────────────────────────────────────────────────────────

  test("(a) the leading 'you may exhaust me' is the FINALIZATION opt-in: asked right after the conquer, before anyone has priority, legend still ready, nothing revealed or moved (383.3.a / 740.4.a.2)", async () => {
    const game = await board().build();
    const d = await conquer(game);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vb" } });
    expect(game.state("vb").isReady).toBe(true);
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vb", controller: P1, triggered: true })]);
  });

  test("(a) 'yes' exhausts the legend BLIND, in the pay-costs step of finalization (404.1): exhausted at once, ability on the chain, the two cards still face-down on top of the deck — P1 has seen nothing yet", async () => {
    const game = await board().build();
    await conquer(game);
    await game.p1.yes();
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vb", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // priority, not a card pick
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("(a) P2 receives a reaction window AFTER the exhaust and BEFORE the reveal (406.4): at P2's priority the legend is already down and the deck untouched", async () => {
    const game = await board().build();
    await conquer(game);
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("(a) the second 'You may banish one' is a RESOLUTION choice (383.3.a.3 / 740.4.a.2.a): only after both players pass does P1 get the revealed-cards pick, and it is declinable", async () => {
    const game = await board().build();
    const d = await toRevealPick(game);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(game.chain()).toEqual([]); // the ability is resolving; nothing else pending
    expect(game.zoneOf("skitter")).toBe("mainDeck"); // revealed, not yet moved (424)
    expect(game.zoneOf("big")).toBe("mainDeck");
  });

  // ── (b) full cost; the unaffordable card ────────────────────────────────────────────────────────

  test("(b) 'then play it' is a normal, full-cost play (419.3.b): banishing Skitter and playing it charges its [1] — energy 1 → 0", async () => {
    const game = await board().build();
    await toRevealPick(game);
    expect(game.p1.energy()).toBe(1);
    await playSkitter(game, "base", false);
    expect(game.zoneOf("skitter")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.banishment()).toEqual([]);
  });

  // ADJUDICATED — 419.2.a beats a "the banish stands on its own" reading, because the printed text is
  // "You may banish one, THEN PLAY IT", not "then you may play it": the play is mandatory once the banish
  // is taken. A card whose full cost P1 cannot pay is therefore no legal line at all — taking it would
  // force a Play that fails Check Legality at "all costs were paid" (358.2) and is undone (358.5 /
  // 444.2.a), leaving an instruction that cannot be carried out. Under 419.2.a ("as long as a player has
  // the resources to pay the costs … they may Play cards") / 419.3.c ("no ELIGIBLE cards to Play →
  // nothing happens") only a payable card is an eligible pick, so the 5-cost Big Void is never offered
  // and nothing is banished. Contrast Void Rush (sfd-188-221) / Reinforce (ogn-062-298), which print a
  // discount: there the same gate is applied to the REDUCED cost.
  test("(b) 419.2.a — the unaffordable 5-cost Big Void is not an eligible pick at all ('then play it' is mandatory): only Skitter is offered, picking Big Void is rejected, and nothing reaches banishment", async () => {
    const game = await board().build();
    const d = await toRevealPick(game);
    expect(cardsOf(d)).toEqual(["skitter"]);
    expect((await game.p1.try((p) => p.pick("big"))).ok).toBe(false);
    expect(game.zoneOf("big")).toBe("mainDeck");
    await game.p1.decline();
    for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context !== "main"; i++) {
      await game.acting().pass();
    }
    // Neither card was banished; both are recycled to the bottom, energy untouched.
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).not.toContain("big");
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("big")).toBe("mainDeck");
    expect(game.zoneOf("skitter")).toBe("mainDeck");
    expect(new Set(game.p1.deck().slice(-2))).toEqual(new Set(["big", "skitter"]));
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.hand()).toEqual([]);
  });

  test("(b) whatever the line, Big Void is never played for free: declining the banish recycles BOTH revealed cards to the bottom, 'third' becomes the top, energy and hand untouched", async () => {
    const game = await board().build();
    await toRevealPick(game);
    await game.p1.decline();
    for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context !== "main"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.units()).not.toContain("big");
    expect(game.p1.deck()[0]).toBe("third");
    expect(new Set(game.p1.deck().slice(-2))).toEqual(new Set(["big", "skitter"]));
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("vb").isExhausted).toBe(true); // the cost stays paid
  });

  // ── (c) the 1-cost: location, Accelerate via Rek'Sai ────────────────────────────────────────────

  test("(c) Skitter is played FROM BANISHMENT and may enter base or ANY battlefield P1 controls — including the just-conquered bf1 (355.2); choosing bf1 puts it there", async () => {
    const game = await board().build();
    await toRevealPick(game);
    await game.p1.pick("skitter");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(game.zoneOf("skitter")).toBe("banishment"); // banished first, then played from there
    expect((d as Pick).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bfHome"]);
    await game.p1.pick("battlefield-bf1");
    for (let i = 0; i < 6; i++) {
      const cur = game.decision();
      if (cur?.kind === "yes-no" && cur.seat === P1) {
        await game.p1.no();
      } else if (cur?.kind === "action" && cur.passKey) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("skitter")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["skitter", "walker"]);
  });

  test("(c) Rek'Sai grants the non-hand play [Accelerate]: with 2 energy + 1 fury P1 is offered the extra [1][fury], pays it, and Skitter enters READY with the pool at 0/0 (805, 356.2.b.1)", async () => {
    const game = await board({ energy: 2, fury: 1 }).build();
    await toRevealPick(game);
    const seen = await playSkitter(game, "base", true);
    expect(seen.accelOffered).toBe(true);
    expect(game.zoneOf("skitter")).toBe("base");
    expect(game.state("skitter").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(c) with only 1 energy + 1 fury the [1] base cost leaves nothing for Accelerate's [1]: no acceptable [1][fury] offer, Skitter enters EXHAUSTED, energy 0 and the fury is left over", async () => {
    const game = await board({ energy: 1, fury: 1 }).build();
    await toRevealPick(game);
    const seen = await playSkitter(game, "base", true); // would accept if it were legal
    expect(seen.accelOffered ?? false).toBe(false);
    expect(game.zoneOf("skitter")).toBe("base");
    expect(game.state("skitter").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });

  test("(c) contrast — no Rek'Sai, 2 energy + 1 fury: a vanilla unit played from banishment has no Accelerate at all → no [1][fury] offer, enters exhausted, 1 energy + the fury remain", async () => {
    const game = await board({ energy: 2, fury: 1, noReksai: true }).build();
    await toRevealPick(game);
    const seen = await playSkitter(game, "base", true);
    expect(seen.accelOffered ?? false).toBe(false);
    expect(game.zoneOf("skitter")).toBe("base");
    expect(game.state("skitter").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("(c) 'Recycle the rest': the unchosen Big Void goes to the BOTTOM of the deck (not drawn, not banished), 'third' is the new top, the hand never grows", async () => {
    const game = await board().build();
    await toRevealPick(game);
    await playSkitter(game, "base", false);
    expect(game.zoneOf("big")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.deck().at(-1)).toBe("big");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) exhausted legend / no peeking ───────────────────────────────────────────────────────────

  test("(d) Void Burrower ALREADY exhausted: 'exhaust me' cannot be paid → no prompt anyone can accept, nothing revealed (deck order intact), straight to P1's open main phase with the point (404.2)", async () => {
    const game = await board({ legendExhausted: true }).build();
    const d = await conquer(game);
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.p1.points()).toBe(1);
  });

  test("(d) no peeking: 'no' is given before anything is revealed — the legend stays READY, the deck is untouched, and no revealed-card pick ever appears (383.3.a.2)", async () => {
    const game = await board().build();
    const d = await conquer(game);
    expect(d?.kind).toBe("yes-no");
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]); // deciding blind
    await game.p1.no();
    let sawPick = false;
    for (let i = 0; i < 8; i++) {
      const cur = game.decision();
      sawPick ||= cur?.kind === "pick";
      if (!cur || (cur.kind === "action" && cur.context === "main")) {
        break;
      }
      if (cur.kind === "action" && cur.passKey) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(sawPick).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("vb").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["big", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
  });
});
