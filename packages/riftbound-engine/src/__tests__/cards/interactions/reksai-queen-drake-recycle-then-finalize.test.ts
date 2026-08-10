/**
 * Interaction: Rek'Sai, Swarm Queen (sfd-170-221) · Champion Unit · Order · 5+[order] · 5 Might
 *     "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play
 *      it. If it is a unit, you may play it here. Recycle the rest."
 *   × Cloud Drake (ven-048-166) · Unit · Mind · 6 · 5 Might · Dragon — "When you play me, draw 1."
 *   revealed pair: Cloud Drake on top of "Skitter" (inline vanilla unit, 2 energy, 2 Might), then "Third".
 *
 * Rules: 354.2 / 354.3 ("play it" from a resolving effect makes the card a PENDING chain item, but the
 * resolving ability finishes first — incl. "Recycle the rest" — before the pending play proceeds),
 * 337.1 / 337.2 (then the pending item is finalized: location chosen, cost paid; a unit resolves at
 * once and leaves the chain), 355.2.a / 355.2.b (valid locations = base / controlled battlefield, plus
 * "here" made valid by the effect), 356.1 / 419.3.b (full cost — Swarm Queen prints no discount),
 * 357.1 / 358.2 / 358.4 / 358.5 (pay, check legality — an effect-instructed play needs no
 * Action/Reaction; unpaid → undone), 419.2.a / 419.3.a / 419.3.c (only a payable card is an eligible
 * "play it" pick — same convention as the Void Burrower test), 359.2.c (enters exhausted), 323.2.a
 * (a unit arriving mid-combat gains its controller's designation at the next Cleanup), Main-Deck
 * recycles of 2+ cards land on the bottom (random order among themselves).
 *
 * Question: Rek'Sai (ready, base) attacks bf2 (P2's lone 2-Might defender); P1 controls bf1, bf3 is
 * uncontrolled. Trigger resolves, P1 reveals [Cloud Drake, Skitter].
 *  (a) 6 energy: both offered; banish Drake → is Skitter recycled BEFORE the Drake's location/cost
 *      prompt? Locations = {bf2 (here), base, bf1} — not bf3; costs 6 → pool 0; enters bf2 exhausted;
 *      its draw trigger draws THIRD (not Skitter); Drake becomes an attacker and 5+5 vs 2 conquers bf2.
 *  (b) 5 energy: Drake is NOT an eligible pick; Skitter → Drake recycled, Skitter costs 2 (pool 3),
 *      same location set; decline → both recycled, pool 5, Rek'Sai fights alone (5 vs 2, conquers).
 *  (c) Invariant: under no path is the Drake on the board with fewer than 6 energy spent; a refused /
 *      undone play leaves no draw, and Skitter is still recycled.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REKSAI_SWARM_QUEEN = "sfd-170-221";
const CLOUD_DRAKE = "ven-048-166";
const SKITTER = { cardType: "unit", energyCost: 2, might: 2, name: "Skitter" } as const;
const THIRD = { cardType: "unit", energyCost: 3, might: 1, name: "Third Card" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. Rek'Sai ready in base; P1 controls bf1 (Holder 2 stands there); P2 controls bf2 with a lone
 * 2-Might Defender; bf3 uncontrolled and empty. Deck top→bottom: Cloud Drake, Skitter, Third, filler…
 */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", REKSAI_SWARM_QUEEN, "queen")
    .deck(P1, [CLOUD_DRAKE, SKITTER, THIRD], ["drake", "skitter", "third"]);
}

/** Rek'Sai attacks bf2 → trigger on the chain → "yes" to the reveal → P1/P2 pass → the revealed-cards pick. */
async function toRevealPick(game: Game): Promise<Pick> {
  await game.p1.move("queen", "bf2");
  expect(game.state("queen").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "queen", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
  return d as Pick;
}

const cardsOf = (d: Pick | Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Pass priority until the chain is empty (stops at any non-action prompt). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Rek'Sai, Swarm Queen reveals Cloud Drake + Skitter — recycle the rest BEFORE the pending play is finalized", () => {
  // ── (a) 6 energy: banish the Drake ───────────────────────────────────────────────────────

  test("(a) with 6 energy both revealed cards are affordable at full cost → offered picks = {Cloud Drake, Skitter} + decline; nothing has moved yet", async () => {
    const game = await board(6).build();
    const d = await toRevealPick(game);
    expect(cardsOf(d).sort()).toEqual(["drake", "skitter"]);
    expect(d.allowDecline).toBe(true);
    expect(game.p1.deck().slice(0, 3)).toEqual(["drake", "skitter", "third"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.energy()).toBe(6);
  });

  test("(a) banishing the Drake: it goes to BANISHMENT and becomes a PENDING chain item; Rek'Sai's ability finishes first — Skitter is ALREADY on the bottom of the deck and Third is on top — and only then is P1 asked where the Drake goes, still unpaid (354.2/354.3 → 337.1)", async () => {
    const game = await board(6).build();
    await toRevealPick(game);
    await game.p1.pick("drake");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    // At the moment of the location prompt:
    expect(game.zoneOf("drake")).toBe("banishment");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1 })]);
    expect(game.chain().some((c) => c.cardId === "queen")).toBe(false); // her ability is done
    expect(game.zoneOf("skitter")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("skitter"); // recycled to the bottom …
    expect(game.p1.deck()[0]).toBe("third"); // … so Third is the top card now
    expect(game.p1.energy()).toBe(6); // cost not yet paid
    expect(game.p1.hand()).toEqual([]);
  });

  test("(a) location set for the Drake = {bf2 'here' (355.2.b, although P1 does not control it), P1's base, bf1 (controlled)} — the uncontrolled bf3 is NOT offered (355.2.a)", async () => {
    const game = await board(6).build();
    await toRevealPick(game);
    await game.p1.pick("drake");
    const d = game.decision();
    expect(cardsOf(d).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    expect(cardsOf(d)).not.toContain("battlefield-bf3");
    expect((await game.p1.try((p) => p.pick("battlefield-bf3"))).ok).toBe(false);
  });

  test("(a) choosing bf2: the full 6 energy is paid (pool 0, no discount — 356/419.3.b), the Drake enters bf2 EXHAUSTED and leaves the chain at once (359.2.c, 337.2); its 'When you play me' trigger is now the only chain item; no Action/Reaction needed mid-showdown (419.3.a, 358.4)", async () => {
    const game = await board(6).build();
    await toRevealPick(game);
    await game.p1.pick("drake");
    await game.p1.pick("battlefield-bf2");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("drake")).toBe("battlefield-bf2");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true, type: "ability" })]);
    expect(game.p1.hand()).toEqual([]); // draw not yet resolved
  });

  test("(a) the draw trigger resolves → P1 draws THIRD, not Skitter — proving 'Recycle the rest' happened before the Drake was finalized; Skitter stays on the bottom", async () => {
    const game = await board(6).build();
    await toRevealPick(game);
    await game.p1.pick("drake");
    await game.p1.pick("battlefield-bf2");
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["third"]);
    expect(game.zoneOf("skitter")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("skitter");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // back in the combat showdown
  });

  test("(a) the Drake gains the Attacker designation at the next Cleanup (323.2.a) and fights: 5+5 vs 2 → Defender dies, both attackers unhurt, P1 conquers bf2 (+1)", async () => {
    const game = await board(6).build();
    await toRevealPick(game);
    await game.p1.pick("drake");
    await game.p1.pick("battlefield-bf2");
    await drainChain(game);
    expect(game.state("drake").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.units("bf2").sort()).toEqual(["drake", "queen"]);
    expect(game.state("drake").damage).toBe(0);
    expect(game.state("queen").damage).toBe(0);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) 5 energy: the Drake is not an eligible pick ─────────────────────────────────────

  test("(b) with only 5 energy the 6-cost Cloud Drake is NOT an eligible 'banish one, then play it' pick (419.2.a / 419.3.c): offered = {Skitter} + decline; naming the Drake is rejected and nothing is banished", async () => {
    const game = await board(5).build();
    const d = await toRevealPick(game);
    expect(cardsOf(d)).toEqual(["skitter"]);
    expect(d.allowDecline).toBe(true);
    expect((await game.p1.try((p) => p.pick("drake"))).ok).toBe(false);
    expect(game.zoneOf("drake")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.energy()).toBe(5);
  });

  test("(b) picking Skitter: Skitter banished → pending; the Drake is recycled to the bottom FIRST (Third on top); then Skitter is finalized — locations {bf2, base, bf1}, pays 2 → pool 3, enters exhausted; no draw (Skitter has no ability)", async () => {
    const game = await board(5).build();
    await toRevealPick(game);
    await game.p1.pick("skitter");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(game.zoneOf("skitter")).toBe("banishment");
    expect(game.p1.deck().at(-1)).toBe("drake");
    expect(game.p1.deck()[0]).toBe("third");
    expect(cardsOf(d).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("base");
    expect(game.p1.energy()).toBe(3);
    expect(game.state("skitter")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("drake")).toBe("mainDeck");
  });

  test("(b) declining: nothing banished, BOTH revealed cards recycled to the bottom (Third on top), pool stays 5; combat proceeds Rek'Sai 5 vs 2 → she conquers bf2 alone", async () => {
    const game = await board(5).build();
    await toRevealPick(game);
    await game.p1.decline();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(new Set(game.p1.deck().slice(-2))).toEqual(new Set(["drake", "skitter"]));
    expect(game.p1.energy()).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.units("bf2")).toEqual(["queen"]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual([]);
  });

  // ── (c) invariant ───────────────────────────────────────────────────────────────────────

  test("(c) invariant at 5 energy, whatever the engine allows: the Drake is never on the board with fewer than 6 energy spent — a refused/undone play leaves pool 5, no draw, no Drake on bf2/base, bf2 still P2's and Contested only by Rek'Sai; Skitter is still recycled (358.2/358.5)", async () => {
    const game = await board(5).build();
    await toRevealPick(game);
    const tried = await game.p1.try((p) => p.pick("drake"));
    if (tried.ok) {
      // An engine that let the unaffordable banish through must undo the play at Check Legality.
      for (let i = 0; i < 6; i++) {
        const d = game.decision();
        if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
          await game.p1.try((p) => p.pick("battlefield-bf2"));
        } else if (d?.kind === "action" && d.context === "chain") {
          await game.acting().passPriority();
        } else {
          break;
        }
      }
      expect(game.zoneOf("drake")).toBe("banishment"); // stays banished — not deck top, hand or trash
    } else {
      await game.p1.decline();
    }
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.hand()).toEqual([]); // no "When you play me, draw 1"
    expect(["base", "battlefield-bf1", "battlefield-bf2", "battlefield-bf3"]).not.toContain(game.zoneOf("drake"));
    expect(game.p1.units("bf2")).toEqual(["queen"]);
    expect(game.zoneOf("skitter")).toBe("mainDeck");
    expect(game.p1.deck().slice(-2)).toContain("skitter");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.violations()).toEqual([]);
  });
});
