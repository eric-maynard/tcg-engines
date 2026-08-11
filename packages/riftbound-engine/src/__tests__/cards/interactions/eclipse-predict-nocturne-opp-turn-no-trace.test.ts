/**
 * Interaction: Eclipse (unl-063-219) · Spell · Mind · 3 · Reaction
 *     "Give a unit -4 [Might] this turn. [Predict]. (Look at the top card of your Main Deck. You may
 *      recycle it.)"
 *   × Nocturne, Horrifying (ogn-194-298) · Champion Unit · Chaos · 4 + [chaos] · 4 Might · [Ganking]
 *     "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play
 *      me for [rainbow]."
 *
 * Question: P1's turn. P1 attacks bf1 (P2's, defended by 3-Might D) with 5-Might A. P1 passes Focus; P2
 * plays Eclipse on A. The TOP card of P2's deck is Nocturne; P2 has exactly 1 power and (after Eclipse)
 * 0 energy.
 *   (a) NO line: P2 declines the banish and declines Predict's recycle. What may P1's redacted view show
 *       about P2's two Decisions and P2's deck — distinguishable from "top card was a blank"?
 *   (b) NO-but-recycle: what does P1 observe?
 *   (c) YES line: banish + play. It is P1's turn, the state is Closed, Nocturne has neither Action nor
 *       Reaction — legal? cost? locations offered (P2's base? bf1 P2 defends? bf2 P1 controls?)? does P1
 *       get a Reaction window against the unit? how does it enter; does it fight in this combat?
 *   (d) Is the -4 applied before the look, so A is already 1 when Nocturne lands?
 *
 * Rules: 436.1 (Predict = LOOK), 128.3 / 128.4 vs 424.1 (a look is private; a banished card is public),
 * 419.3 / 419.3.b (effect-created play: pending item that finalizes when the resolving spell is done),
 * 354.3, 358.4 (the granting effect is the permission — no Action/Reaction needed), 356.1.a-style "for
 * [rainbow]" (RiftJudge: total price = one power of any domain), 355.2.a (base or a battlefield you
 * CONTROL), 337.2 (a permanent resolves immediately — no Reaction window), 143.4 / 359.2.c (enters
 * exhausted), 323.2.a (gains Defender at the next cleanup).
 *
 * Expected: (d) -4 first (A = 1), then the look. (a) P1 sees at most that P2 has SOME pending decision —
 * no card id/name; P1 cannot answer it; after both declines P1's observable world equals the blank-top
 * world (deck count unchanged, banishment empty). (b) one card moved top→bottom face-down; no Nocturne
 * trace. (c) Legal: banish (now public) → play for exactly 1 power, no energy → destinations = P2's base
 * and bf1 (NOT bf2) → enters bf1 EXHAUSTED as a Defender with no P1 window; A(1) vs D(3)+Nocturne(4) →
 * A dies, P2 holds; Eclipse → P2's trash. Banish-but-can't/won't-pay: Nocturne stays in banishment.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Observation } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ECLIPSE = "unl-063-219";
const NOCTURNE = "ogn-194-298";

/** A recognisable vanilla filler card (uncastable 9-cost blank spell). */
const blank = (n: string) => ({ abilities: [], cardType: "spell", domain: "mind", energyCost: 9, name: `Card ${n.toUpperCase()}` });

interface Opts {
  /** P2's top card: Nocturne (default) or a blank. */
  top?: "noc" | "blank";
  /** P2's power of any domain (default 1). */
  power?: number;
}

/**
 * P1's turn 2. bf1: P2's D (3). bf2: P1's Holder (1) — a battlefield P2 does NOT control. P1: A (5) in
 * base. P2: Eclipse in hand, {3 energy, `power` rainbow}; deck top→: noc|top, d2, d3 (+ filler).
 */
function board(o: Opts = {}) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
    .unit(P1, "bf2", { might: 1, name: "P1 Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Attacker A" }, "A")
    .hand(P2, ECLIPSE, "eclipse")
    .resources(P2, { energy: 3, power: { rainbow: o.power ?? 1 } });
  return (o.top ?? "noc") === "noc"
    ? b.deck(P2, [NOCTURNE, blank("d2"), blank("d3")], ["noc", "d2", "d3"])
    : b.deck(P2, [blank("d1"), blank("d2"), blank("d3")], ["top", "d2", "d3"]);
}

/** A attacks bf1, P1 passes Focus, P2 casts Eclipse on A, both pass → Eclipse is resolving (stops at its first prompt). */
async function eclipseResolving(o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.move("A", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.cast("eclipse", { targets: "A" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: o.power ?? 1 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

/** What P1 can observe, minus the decision cursor and sequence number (for world-equality checks). */
function p1World(game: Game): string {
  const v: Observation = game.p1.view();
  return JSON.stringify({ battlefields: v.battlefields, chain: v.chain, points: v.points, resources: v.resources, zones: v.zones });
}

const mentionsNocturne = (s: string): boolean => s.includes("noc") || s.includes("Nocturne") || s.includes(NOCTURNE);

describe("Eclipse's Predict finds Nocturne on the opponent's turn — private look, public banish", () => {
  // ---- (d) order inside Eclipse ------------------------------------------------------------------------------

  test("(d) Eclipse executes in printed order: A already has -4 (5 → 1) when the Predict look raises Nocturne's 'you may banish me' for P2 (436.1)", async () => {
    const game = await eclipseResolving();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "noc" } });
    expect(game.state("A")).toMatchObject({ might: 1, mightModifier: -4 });
    expect(game.zoneOf("noc")).toBe("mainDeck"); // still on top while looked at
    expect(game.p2.deck()[0]).toBe("noc");
    expect(game.zoneOf("eclipse")).toBe("chain");
  });

  // ---- (a) NO line: nothing may leak ----------------------------------------------------------------------------

  test("(a) the banish offer is P2's decision, answerable from P2's own view (which DOES carry the looked-at identity); P1 answering it is refused with NOT_YOUR_DECISION", async () => {
    const game = await eclipseResolving();
    const own = game.p2.view().decision;
    expect(own).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(mentionsNocturne(JSON.stringify(own))).toBe(true);
    const r = await game.p1.try((p) => p.answer("no"));
    expect(r.ok).toBe(false);
    expect((r as { error: { code: string } }).error.code).toBe("NOT_YOUR_DECISION");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 }); // untouched
  });

  // Expected (128.4 — a look is private): P1's redacted view may show that P2 has a pending yes-no, but no
  // card id / name / prompt text naming the looked-at card. Actual: the DecisionSummary handed to P1 carries
  // the prompt "Nocturne, Horrifying [noc]: perform the optional effect?" verbatim.
  test("(a) while P2 weighs the banish, P1's redacted view must not name the privately looked-at card anywhere (128.3/128.4)", async () => {
    const game = await eclipseResolving();
    const seen = game.p1.view();
    expect(seen.decision).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(mentionsNocturne(JSON.stringify(seen))).toBe(false);
  });

  test("(a) P1's view of P2's deck during the look: every card is a face-down placeholder (no ids), banishment empty", async () => {
    const game = await eclipseResolving();
    const v = game.p1.view();
    const p2Deck = (v.zones.mainDeck ?? []).filter((c) => (c as { owner?: string }).owner === P2);
    expect(p2Deck.length).toBe(game.p2.deck().length);
    expect(p2Deck.every((c) => (c as { hidden?: boolean }).hidden === true)).toBe(true);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(a) NO + NO: P2 declines the banish, then declines Predict's recycle → Eclipse to P2's trash, deck unchanged (Nocturne still on top, same count), banishment empty, Focus back with P1 — and P1's view no longer mentions Nocturne anywhere", async () => {
    const game = await eclipseResolving();
    const deckBefore = [...game.p2.deck()];
    await game.p2.no();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, semantics: "from-revealed", source: { cardId: "eclipse" } });
    expect(mentionsNocturne(JSON.stringify(game.p1.view()))).toBe(false); // the recycle prompt is redacted for P1
    await game.p2.decline();
    expect(game.zoneOf("eclipse")).toBe("trash");
    expect(game.p2.deck()).toEqual(deckBefore);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.state("A").might).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(mentionsNocturne(JSON.stringify(game.p1.view()))).toBe(false);
  });

  test("(a) after both declines P1's observable world is IDENTICAL to the world where P2's top card was a blank and P2 declined the recycle", async () => {
    const noc = await eclipseResolving();
    await noc.p2.no();
    await noc.p2.decline();

    const blankTop = await eclipseResolving({ top: "blank" });
    expect(blankTop.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "from-revealed" }); // straight to Predict — no banish offer
    expect(blankTop.p1.view().decision).toMatchObject({ kind: "pick", seat: P2 });
    await blankTop.p2.decline();

    expect(p1World(noc)).toBe(p1World(blankTop));
  });

  // ---- (b) NO but recycle -----------------------------------------------------------------------------------------

  test("(b) NO + recycle: P2 keeps Nocturne a deck card and recycles it — one card moves top → bottom, count preserved; P1 sees only face-down placeholders and no Nocturne trace (128.3)", async () => {
    const game = await eclipseResolving();
    const count = game.p2.deck().length;
    await game.p2.no();
    await game.p2.pick("noc");
    expect(game.p2.deck()).toHaveLength(count);
    expect(game.p2.deck()[0]).toBe("d2");
    expect(game.p2.deck().at(-1)).toBe("noc");
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("eclipse")).toBe("trash");
    const v = game.p1.view();
    expect(mentionsNocturne(JSON.stringify(v))).toBe(false);
    expect((v.zones.mainDeck ?? []).filter((c) => (c as { owner?: string }).owner === P2).every((c) => (c as { hidden?: boolean }).hidden === true)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // ---- (c) YES line ------------------------------------------------------------------------------------------------

  test("(c) YES: banishing comes first and makes Nocturne PUBLIC — it is in P2's banishment and P1's view may now name it; then 'you may play me' is asked (still P2's, still inside Eclipse's resolution)", async () => {
    const game = await eclipseResolving();
    await game.p2.yes(); // banish me
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["noc"]);
    expect(mentionsNocturne(JSON.stringify(game.p1.view()))).toBe(true);
    await game.settle(); // nothing for anyone to pass — stops at P2's next prompt
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "noc" } });
    expect(game.zoneOf("eclipse")).toBe("chain"); // Eclipse has not finished resolving
  });

  test("(c) the play is legal on P1's turn in a Closed state with no Action/Reaction on the card (358.4 via 419.3): it becomes a PENDING permanent item; destinations offered = P2's base and bf1 (P2 controls it, defending there is fine) — NOT bf2, which P1 controls (355.2.a)", async () => {
    const game = await eclipseResolving();
    expect(game.state("noc").keywords).toEqual(["Ganking"]);
    await game.p2.yes();
    await game.settle();
    await game.p2.yes(); // play me for [rainbow]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "noc", controller: P2, pending: true, triggered: false, type: "permanent" })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination", source: { cardId: "noc" } });
    expect((d as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await expect(game.p2.pick("battlefield-bf2")).rejects.toThrow();
  });

  test("(c) 'for [rainbow]' = exactly one power of any domain, no energy, no [chaos]: {0, rainbow 1} → {0, rainbow 0}; placed at bf1 it enters EXHAUSTED, P2-controlled, and is a DEFENDER; the chain is empty again — P1 got no Reaction window against the unit (337.2) and simply holds Focus", async () => {
    const game = await eclipseResolving();
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("noc")).toMatchObject({ combatRole: "defender", controller: P2, isExhausted: true, location: "bf1", might: 4, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("eclipse")).toBe("trash"); // Eclipse finished, then the pending unit finalized + resolved at once
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.moveId).sort()).toEqual(["concede", "passShowdownFocus"]);
    expect(game.p2.deck()[0]).toBe("d2"); // Nocturne left the deck; nothing else moved
  });

  test("(c) it fights in THIS combat: A (1 after Eclipse) vs D (3) + Nocturne (4) → A dies, P2 successfully defends bf1, no points; Nocturne stays at bf1", async () => {
    const game = await eclipseResolving();
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("noc")).toMatchObject({ controller: P2, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) played to P2's BASE instead: legal, exhausted, takes no part in the combat — A (1) vs D (3) alone still loses", async () => {
    const game = await eclipseResolving();
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("base");
    expect(game.state("noc")).toMatchObject({ controller: P2, isExhausted: true, location: "base" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1.controller).toBe(P2);
  });

  // ---- banish but no play ---------------------------------------------------------------------------------------------

  test("banish YES, play NO: Nocturne simply stays in banishment (public), the power is unspent, Eclipse finishes → trash, no pending item left behind", async () => {
    const game = await eclipseResolving();
    await game.p2.yes();
    await game.settle();
    await game.p2.no();
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("eclipse")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("banish YES with 0 power: the [rainbow] cannot be paid → the play is never performed (no destination prompt, nothing enters); Nocturne stays in banishment, Eclipse → trash", async () => {
    const game = await eclipseResolving({ power: 0 });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "noc" } }); // banishing itself costs nothing
    await game.p2.yes();
    expect(game.zoneOf("noc")).toBe("banishment");
    // Whatever is (or is not) asked next, drive P2's remaining prompts with "yes"/first option:
    for (let i = 0; i < 4 && game.decision()?.seat === P2 && game.decision()?.kind !== "action"; i++) {
      await game.settle({ maxSteps: 1, policy: "first" });
    }
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.p2.units("bf1")).toEqual(["D"]);
    expect(game.p2.base()).not.toContain("noc");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("eclipse")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });
});
