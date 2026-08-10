/**
 * Interaction: Rebuttal (ven-152-166) · Spell [Reaction] · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   × Decree of Strength (ven-085-166) · Spell · Body · 1
 *     "Choose an opponent. They reveal their hand and you choose a Mind ([mind]) card from it. They
 *      recycle that card."
 *
 * Position (1v1, P1's turn): P1 hand = {Decree, M1 = Stupefy (Mind), F1 = Cleave (Fury)}, exactly 1 energy.
 * P2 hand = {Rebuttal, M2 = Stupefy (Mind), F2 = Cleave (Fury)}, 1 energy + [rainbow][rainbow] (Rebuttal's
 * 1 + [C] and one [rainbow] for its option). Both Main Decks are exactly two known filler cards.
 * P1 casts Decree (choosing P2, the only opponent); P2 responds with Rebuttal on Decree.
 *
 * Question: (a) Rebuttal resolves first: P2 gets a PAY opt-in — decidable from P2's seat, nothing private
 * involved. (b) P2 pays and takes control: is the re-choosable slot the chosen PLAYER, options from P2's
 * seat = {P1}, no hand ids in the prompt? Re-choosing P1: P1 (not P2) reveals their hand publicly
 * (attributed to P1), P2 must pick a Mind card M1, P1 recycles M1 to the bottom of P1's deck (secret to
 * both), Decree → its OWNER P1's trash; P2's hand never exposed. (c) P2 pays but KEEPS P2: the player
 * target is illegal at resolution → nobody reveals, no pick. (d) P2 declines: Decree countered → P1's
 * trash; no hand ever revealed.
 *
 * Rules: 751.1 / 752.1 (new choices may remake targets — incl. PLAYERS), 753 / 753.1 (any subset; only
 * legal new values, read from the new controller's seat), 754, 355.10 (a chosen player is a target),
 * 359.3.d (resolved spell → owner's trash), 359.3.e.2 / 359.3.e.5 (illegal target → its instructions are
 * skipped), 424.1 / 424.3.a (reveal hand = all current cards, to everyone), 424.1.a.3 (Revealed ends with
 * the effect), 128.3 / 108.4.d (deck is Secret), 416 (recycle → bottom of owner's deck), 425.1 (counter).
 * Decree ruling (riftjudge 11774): a multi-domain card that includes Mind qualifies.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game, Viewer } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const DECREE_OF_STRENGTH = "ven-085-166";
const STUPEFY = "ogn-095-298"; // Mind spell — the "Mind card"
const CLEAVE = "ogn-004-298"; // Fury spell — revealed but never choosable
const FILLER = "ogn-175-298";

const P1_HAND_PRIVATE = ["m1", "f1"] as const; // (Decree itself becomes public on the chain)
const P2_HAND_PRIVATE = ["m2", "f2"] as const; // (Rebuttal becomes public on the chain)

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

function board() {
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { rainbow: 2 } })
    .deck(P1, [FILLER, FILLER], ["p1d1", "p1d2"])
    .deck(P2, [FILLER, FILLER], ["p2d1", "p2d2"])
    .hand(P1, DECREE_OF_STRENGTH, "decree")
    .hand(P1, STUPEFY, "m1")
    .hand(P1, CLEAVE, "f1")
    .hand(P2, REBUTTAL, "reb")
    .hand(P2, STUPEFY, "m2")
    .hand(P2, CLEAVE, "f2");
}

/** P1 casts Decree, passes; P2 Rebuttals it; both pass until Rebuttal resolves (stops at P2's pay prompt). */
async function rebutted(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "decree" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["decree", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((i) => i.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

/** Pass priority around until the chain is empty or a non-action prompt parks. */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

/** `owner`'s hand as `viewer` sees it: ids for face-up cards, "?" for redacted ones. */
function handSeenBy(game: Game, viewer: Viewer, owner: typeof P1): string[] {
  return game.view(viewer).zones.hand.filter((c: CardView) => c.owner === owner).map((c) => (isHiddenView(c) ? "?" : c.id));
}

/** `owner`'s Main Deck as `viewer` sees it (top first). */
function deckSeenBy(game: Game, viewer: Viewer, owner: typeof P1): string[] {
  return game.view(viewer).zones.mainDeck.filter((c: CardView) => c.owner === owner).map((c) => (isHiddenView(c) ? "?" : c.id));
}

/** Which of `ids` appear ANYWHERE in what seat `viewer` can read (observation + own decision + menu). */
function mentions(game: Game, viewer: typeof P1, ids: readonly string[]): string[] {
  const seat = game.seat(viewer);
  const blob = JSON.stringify([seat.view(), seat.decision(), seat.legal()]);
  return ids.filter((id) => blob.includes(`"${id}"`) || blob.includes(`[${id}]`));
}

function publicReveals(game: Game): readonly { cardIds: readonly string[]; playerId: string }[] {
  return (game.gameState.publicReveals ?? []) as readonly { cardIds: readonly string[]; playerId: string }[];
}

describe("Rebuttal × Decree of Strength — stealing a 'Choose an opponent. They reveal their hand' spell flips who reveals", () => {
  // ── setup / (a) ───────────────────────────────────────────────────────────────────────────────

  test("setup: Decree (Energy 1 ≤ 4) is a public chain item and the ONLY spell offered to Rebuttal; Rebuttal is finalized above it for 1 + [C]; while both sit on the chain neither seat sees the other's hand", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.passPriority();
    expect(targetsOffered(game, P2, "reb")).toEqual(["decree"]);
    await game.p2.cast("reb", { targets: "decree" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain().map((i) => [i.cardId, i.controller])).toEqual([
      ["decree", P1],
      ["reb", P2],
    ]);
    expect(handSeenBy(game, P1, P2)).toEqual(["?", "?"]);
    expect(handSeenBy(game, P2, P1)).toEqual(["?", "?"]);
    expect(mentions(game, P1, P2_HAND_PRIVATE)).toEqual([]);
    expect(mentions(game, P2, P1_HAND_PRIVATE)).toEqual([]);
  });

  test("(a) Rebuttal resolves first (LIFO): P2 — its controller — gets a 'you may pay [rainbow]' opt-in, acceptable from P2's public pool; P2's view carries the full prompt, P1's view only that P2 has a yes/no pending; no hand identity is involved on either side", async () => {
    const game = await rebutted();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "reb" } });
    expect(game.p2.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    expect(game.view(P1).decision).toMatchObject({ kind: "yes-no", seat: P2 });
    expect("canAccept" in (game.view(P1).decision ?? {})).toBe(false); // summary only
    expect(game.p1.decision()).toBeNull();
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    expect(publicReveals(game)).toEqual([]);
    expect(mentions(game, P1, P2_HAND_PRIVATE)).toEqual([]);
    expect(mentions(game, P2, P1_HAND_PRIVATE)).toEqual([]);
    expect(game.zoneOf("decree")).toBe("chain");
  });

  // ── (b) pay → control flips → new choices → P1 reveals ────────────────────────────────────────

  test("(b) paying [rainbow] flips Decree's controller to P2 (a control change, not a counter); Rebuttal → P2's trash; still nothing revealed", async () => {
    const game = await rebutted();
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, countered: false })]);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(publicReveals(game)).toEqual([]);
    expect(mentions(game, P1, P2_HAND_PRIVATE)).toEqual([]);
    expect(mentions(game, P2, P1_HAND_PRIVATE)).toEqual([]);
  });

  // BUG — expected (751.1 / 752.1 / 355.10): "Choose an opponent" was a finalization choice of a PLAYER, so
  // after gaining control P2 is offered a new-choices slot for it, evaluated from P2's seat (753.1): the
  // only opponent of P2 is P1; the prompt names player ids only. Actual: the engine never records the
  // chosen opponent (reveal-hand re-derives "an opponent of the controller" at resolution), so no
  // new-choices prompt appears at all — priority goes straight back to the chain.
  test("(b) after paying, P2 gets a NEW-CHOICES prompt whose slot is the chosen PLAYER — options {P1} from P2's seat, current value P2, no card id from either hand (751.1, 752.1, 753.1, 355.10)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.newChoices : undefined).toBeDefined();
    const options = d?.kind === "pick" ? d.options : [];
    expect(options.filter((o) => !o.current).map((o) => o.seatRef ?? o.key)).toEqual([P1]);
    const blob = JSON.stringify(d);
    for (const id of [...P1_HAND_PRIVATE, ...P2_HAND_PRIVATE]) {
      expect(blob).not.toContain(`"${id}"`);
    }
  });

  test("(b) with P1 as the chosen opponent, Decree resolves under P2's control: P1 (not P2) reveals their WHOLE hand — public record attributed to P1, both M1 and F1 face-up in P2's view — and P2 gets a MANDATORY pick over exactly the Mind card M1 (F1 revealed but not choosable)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await game.p2.pick(P1); // re-choose the chosen player from P2's seat: P1 is the only legal opponent
    await resolveChain(game);
    expect(publicReveals(game)).toContainEqual(expect.objectContaining({ cardIds: ["m1", "f1"], playerId: P1 }));
    expect(handSeenBy(game, P2, P1)).toEqual(["m1", "f1"]);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "from-revealed", source: { cardId: "decree" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["m1"]);
    expect(d?.kind === "pick" ? d.meta : undefined).toMatchObject({ onPicked: "recycle", revealer: P1 });
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p2.try((p) => p.pick("f1"))).ok).toBe(false);
    // P2's own hand was never instructed to be revealed.
    expect(handSeenBy(game, P1, P2)).toEqual(["?", "?"]);
    expect(mentions(game, P1, P2_HAND_PRIVATE)).toEqual([]);
    expect(game.zoneOf("decree")).toBe("chain");
  });

  test("(b) P2 picks M1: P1 recycles it to the BOTTOM of P1's own deck (416) where it is Secret again — neither seat's view (not even P1's) names it; F1 stays in P1's hand and is private again once Decree finishes; Decree → its OWNER P1's trash (359.3.d), Rebuttal in P2's; all costs stay spent", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await game.p2.pick(P1);
    await resolveChain(game);
    await game.p2.pick("m1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2", "m1"]); // omniscient
    expect(game.zoneOf("m1")).toBe("mainDeck");
    for (const viewer of [P1, P2]) {
      expect(deckSeenBy(game, viewer, P1)).toEqual(["?", "?", "?"]);
      expect(mentions(game, viewer, ["m1"])).toEqual([]);
    }
    expect(game.p1.hand()).toEqual(["f1"]);
    expect(handSeenBy(game, P2, P1)).toEqual(["?"]); // 424.1.a.3 — the reveal window closed with Decree
    expect(mentions(game, P2, ["f1"])).toEqual([]);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(game.p2.hand().sort()).toEqual(["f2", "m2"]);
    expect(game.p2.deck()).toEqual(["p2d1", "p2d2"]);
    expect(handSeenBy(game, P1, P2)).toEqual(["?", "?"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) pay but keep the original player ──────────────────────────────────────────────────────

  // BUG — expected (753: any subset may be kept; 359.3.e.2 / 359.3.e.5): P2 keeps the original choice
  // "P2"; at resolution P2 is not an opponent of the controller (P2) → illegal player target → nobody
  // reveals, no pick, no recycle; Decree just goes to P1's trash. Actual: there is no player slot to keep
  // (see the BUG above) — the engine always makes the NEW controller's opponent (P1) reveal.
  test("(c) P2 pays but KEEPS 'P2' as the chosen player: the target is illegal at resolution → no hand is revealed, no pick is raised, nothing recycled; Decree → P1's trash (753, 359.3.e.2, 359.3.e.5)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.newChoices : undefined).toBeDefined();
    await game.p2.decline(); // keep the current player
    await resolveChain(game);
    await game.settle();
    expect(publicReveals(game)).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["f1", "m1"]);
    expect(game.p2.hand().sort()).toEqual(["f2", "m2"]);
    expect(handSeenBy(game, P2, P1)).toEqual(["?", "?"]);
    expect(handSeenBy(game, P1, P2)).toEqual(["?", "?"]);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.trash()).toEqual(["decree"]);
  });

  // ── (d) decline → counter ─────────────────────────────────────────────────────────────────────

  test("(d) P2 declines to pay: 'Otherwise, counter it' — Decree leaves the chain unresolved into its owner P1's trash, P1's 1 energy not refunded, P2 keeps the unspent [rainbow]; NO hand is ever revealed and neither seat's view gains the other's hand ids", async () => {
    const game = await rebutted();
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(publicReveals(game)).toEqual([]);
    await game.settle();
    expect(publicReveals(game)).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["f1", "m1"]);
    expect(game.p2.hand().sort()).toEqual(["f2", "m2"]);
    expect(handSeenBy(game, P1, P2)).toEqual(["?", "?"]);
    expect(handSeenBy(game, P2, P1)).toEqual(["?", "?"]);
    expect(mentions(game, P1, P2_HAND_PRIVATE)).toEqual([]);
    expect(mentions(game, P2, P1_HAND_PRIVATE)).toEqual([]);
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("across (b)/(d): P1's view NEVER contains a P2 hand identity at any step, and P2 only ever sees P1's hand during Decree's resolution window in the pay branch", async () => {
    // pay branch, step by step
    const b = await board().build();
    const p1NeverSeesP2 = (g: Game): void => {
      expect(mentions(g, P1, P2_HAND_PRIVATE)).toEqual([]);
    };
    await b.p1.cast("decree");
    p1NeverSeesP2(b);
    expect(mentions(b, P2, P1_HAND_PRIVATE)).toEqual([]);
    await b.p1.passPriority();
    await b.p2.cast("reb", { targets: "decree" });
    p1NeverSeesP2(b);
    while (b.decision()?.kind === "action") {
      await b.acting().passPriority();
      p1NeverSeesP2(b);
    }
    expect(mentions(b, P2, P1_HAND_PRIVATE)).toEqual([]); // pay prompt: still private
    await b.p2.yes();
    p1NeverSeesP2(b);
    await b.p2.pick(P1);
    while (b.decision()?.kind === "action" && b.chain().length > 0) {
      expect(mentions(b, P2, P1_HAND_PRIVATE)).toEqual([]); // not before Decree actually resolves
      await b.acting().passPriority();
      p1NeverSeesP2(b);
    }
    expect(mentions(b, P2, P1_HAND_PRIVATE).sort()).toEqual(["f1", "m1"]); // the resolution window
    await b.p2.pick("m1");
    await b.settle();
    p1NeverSeesP2(b);
    expect(mentions(b, P2, P1_HAND_PRIVATE)).toEqual([]);
    // decline branch
    const d = await rebutted();
    p1NeverSeesP2(d);
    await d.p2.no();
    await d.settle();
    p1NeverSeesP2(d);
    expect(mentions(d, P2, P1_HAND_PRIVATE)).toEqual([]);
  });
});
