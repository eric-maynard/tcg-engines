/**
 * Interaction: Void Burrower (sfd-187-221) · Legend (Rek'Sai)
 *     "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may
 *      banish one, then play it. Recycle the rest."
 *   × Dredge Up (ven-049-166) · Spell · Mind · 2 · no Action/Reaction — "Draw 1. [Flow] [2] (You may
 *     play this from your trash for its Flow cost. Then banish it.)"
 *   × Stargazer (ven-098-166) · Unit — "Spells with [Flow] you play from your trash cost [2] less, to
 *     a minimum of [1]."
 *
 * Question: P1 (legend Void Burrower, Stargazer on board) conquers bf1; the reveal is [Dredge Up, unit U].
 *  (a) P1 banishes Dredge Up and plays it — from which zone, for what cost (Stargazer? Flow cost?), and
 *      does its lack of Action/Reaction matter mid-conquer?
 *  (b) order of "Recycle the rest" vs Dredge Up's payment/resolution;
 *  (c) after resolving: banished (it "has Flow") or trash?
 *  (d) later the same turn: Flow that same Dredge Up from the trash — cost with Stargazer, destination,
 *      and can it go a third time?
 *  (e) contrast: picking U instead — is the recycled Dredge Up Flow-able?
 *
 * Rules: 419.3 / 419.3.a-b (effect-instructed play = Limited play, timing tags irrelevant, other steps
 * normal; 419.2.a full cost unless stated) · 354.3 (the played card goes Pending, the instructing
 * ability finishes — "Recycle the rest" — then the pending play is costed/finalized) · 357.1.a ·
 * 829.1.b/.b.1/.b.2 (Flow = permission to play FROM THE TRASH for the Flow cost + then-banish delayed
 * replacement, generated only by a Flow play) · 155 / 157 / 359.3.d (a resolved spell goes to trash) ·
 * 356.4.e (Stargazer's floor [1]) · 390.3.a · 419.1.a (no permission covers the deck).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_BURROWER = "sfd-187-221";
const DREDGE_UP = "ven-049-166";
const STARGAZER = "ven-098-166";
const SKULKER = "ogn-175-298"; // vanilla 3-cost 3-Might unit = "U"

/**
 * P1: Void Burrower (ready), Stargazer + a 2-Might walker in base, `energy`; P2 holds an EMPTY bf1.
 * P1's deck (top first): Dredge Up "du", Skulker "u", Skulker "third", Skulker "fourth", then filler.
 */
function board(energy = 5) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, VOID_BURROWER, "vb")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", STARGAZER, "stargazer")
    .unit(P1, "base", { might: 2, name: "Tunneler" }, "walker")
    .deck(P1, [DREDGE_UP, SKULKER, SKULKER, SKULKER], ["du", "u", "third", "fourth"]);
}

/** Walk onto bf1, conquer, say "yes" (exhaust the legend), pass priority both ways → the reveal-and-pick prompt. */
async function conquerToReveal(game: Game): Promise<Decision | null> {
  await game.p1.move("walker", "bf1");
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "vb" } });
  await game.p1.yes();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game.decision();
}

/** Drive a played UNIT's follow-ups (destination → base, forced picks) and pass priority until the open state. */
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

describe("Void Burrower plays Dredge Up off the reveal, then the same Dredge Up is Flowed from the trash (Stargazer)", () => {
  // ── (a) the effect play ──────────────────────────────────────────────────────────────────────
  test("(a) the reveal offers [Dredge Up, U] (declinable); picking Dredge Up plays it for its FULL [2] (5 → 3 — no Stargazer discount, no Flow election) as P1's own non-triggered spell item, mid-conquer, despite having no Action/Reaction tag (419.3); P2 gets a Reaction window", async () => {
    const game = await board(5).build();
    const d = await conquerToReveal(game);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["du", "u"]);
    expect(game.zoneOf("du")).toBe("mainDeck"); // revealed, not yet moved (424)
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    await game.p1.pick("du");
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("du")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "du", controller: P1, triggered: false, type: "spell" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) cost pipeline from BANISHMENT: with exactly 1 energy (what a Stargazer-discounted Flow would cost) Dredge Up is not even a legal pick (419.2.a) — neither the Flow alternative (trash-only, 829.1.b) nor Stargazer ('from your trash') applies; with exactly 2 it is the only pick and drains the pool", async () => {
    const poor = await board(1).build();
    const d1 = await conquerToReveal(poor);
    expect(d1).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d1?.kind === "pick" ? d1.options.map((o) => o.card) : ["?"]).toEqual([]); // revealed, nothing payable
    await poor.p1.decline();
    await finish(poor);
    expect(poor.p1.energy()).toBe(1);
    expect(poor.zoneOf("du")).toBe("mainDeck"); // recycled with U

    const exact = await board(2).build();
    const d2 = await conquerToReveal(exact);
    expect(d2?.kind === "pick" ? d2.options.map((o) => o.card) : []).toEqual(["du"]); // U (3) is unaffordable
    await exact.p1.pick("du");
    expect(exact.p1.energy()).toBe(0);
    expect(exact.zoneOf("du")).toBe("chain");
  });

  // ── (b) ordering per 354.3 ───────────────────────────────────────────────────────────────────
  test("(b) 354.3 — the moment Dredge Up is picked, Void Burrower's ability finishes FIRST ('Recycle the rest': U to the bottom, 'third' the new top, hand still empty), then Dredge Up is paid for and finalized on the chain; after P2's window it resolves: draw 1 ('third')", async () => {
    const game = await board(5).build();
    await conquerToReveal(game);
    await game.p1.pick("du");
    // Before anybody passes: the legend's item is gone, U already recycled, Dredge Up paid + on the chain.
    expect(game.chain().map((c) => c.cardId)).toEqual(["du"]);
    expect(game.zoneOf("u")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("u");
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.energy()).toBe(3);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["third"]);
    expect(game.p1.deck()[0]).toBe("fourth");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) destination after the effect play ────────────────────────────────────────────────────
  test("(c) after resolving, Dredge Up goes to the TRASH (157 / 359.3.d) — merely HAVING [Flow] banishes nothing; the then-banish rider exists only for a Flow play (829.1.b.1); banishment is empty again", async () => {
    const game = await board(5).build();
    await conquerToReveal(game);
    await game.p1.pick("du");
    await game.settle();
    expect(game.zoneOf("du")).toBe("trash");
    expect(game.p1.trash()).toEqual(["du"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) second play the same turn, via Flow ──────────────────────────────────────────────────
  test("(d) same turn, Open state: that Dredge Up is now Flow-able from the trash (Flow variant only) for [2] − 2 → floor [1] with Stargazer (3 → 2); it draws 1 more and is BANISHED this time (829.1.b.1) — a third play is impossible", async () => {
    const game = await board(5).build();
    await conquerToReveal(game);
    await game.p1.pick("du");
    await game.settle();
    expect(game.zoneOf("du")).toBe("trash");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "du")).toBe(true);
    expect(game.p1.option("cast", "du")?.fields.find((f) => f.arg === "flow")).toMatchObject({ options: [true], required: true });
    expect(game.p1.energy()).toBe(3);
    await game.p1.cast("du", { flow: true });
    expect(game.p1.energy()).toBe(2); // Stargazer: 2 − 2, floored at 1
    expect(game.zoneOf("du")).toBe("chain");
    await game.settle();
    expect(game.p1.hand()).toEqual(["third", "fourth"]);
    expect(game.zoneOf("du")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["du"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("cast", "du")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "du")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(d) control — without Stargazer the same second play costs the full Flow [2] (3 → 1) and is likewise banished", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .legend(P1, VOID_BURROWER, "vb")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Tunneler" }, "walker")
      .deck(P1, [DREDGE_UP, SKULKER, SKULKER, SKULKER], ["du", "u", "third", "fourth"])
      .build();
    await conquerToReveal(game);
    await game.p1.pick("du");
    await game.settle();
    expect(game.p1.energy()).toBe(3); // the effect play cost the same 2 with or without Stargazer
    expect(game.zoneOf("du")).toBe("trash");
    await game.p1.cast("du", { flow: true });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.zoneOf("du")).toBe("banishment");
  });

  // ── (e) contrast: picking U ──────────────────────────────────────────────────────────────────
  test("(e) had P1 picked U instead: U is played to base for its full 3 (5 → 2), Dredge Up is RECYCLED to the bottom of the Main Deck — and a card in the deck has no Flow permission (419.1.a): not castable", async () => {
    const game = await board(5).build();
    await conquerToReveal(game);
    await game.p1.pick("u");
    await finish(game);
    expect(game.zoneOf("u")).toBe("base");
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("du")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("du");
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "du")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "du")).toBe(false);
  });
});
