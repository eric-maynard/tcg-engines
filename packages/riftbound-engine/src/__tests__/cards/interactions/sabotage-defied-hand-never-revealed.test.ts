/**
 * Interaction: Sabotage (ogn-156-298) · Spell (Action) · Body · 1 + [body]
 *     "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."          — P1's
 *   × Defy (ogn-045-298) · Spell (Reaction) · Calm · 1 + [calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."                                     — in P2's HAND
 *   P2's hand = { Defy, G = Scrapheap (ogn-182-298, gear), U = Vanguard Sergeant (ogn-219-298, unit) }.
 *
 * Rules: 108.1.b (chain items are Public), 108.7.c (a private zone shows only its COUNT to non-owners), 108.7.e (counts are
 * public), 108.4.d / 128.3 (the Main Deck is SECRET — nobody may look), 424.1 / 424.3.a ("reveal their hand" reveals every card in
 * it), 424.1.a.3 (Revealed lasts only until the revealing effect finishes resolving), 425.1 (a countered spell leaves the chain
 * without resolving), 416.1 (Recycle → bottom of its owner's Main Deck), 355.10.a. Sabotage rulings: the opponent is chosen as it
 * is played; reveal + choose + recycle all happen on RESOLUTION; the hand card is not a target; the pick is mandatory if a
 * non-unit exists.
 *
 * Question: (a) while Sabotage sits on the chain and P2 holds priority, does any P1-visible payload expose Defy/G/U? (b) P2
 * answers with Defy from that very hand; Defy resolves first and counters Sabotage — is P2's hand ever revealed, and what does
 * P1 legitimately learn? (c) contrast — P2 passes and Sabotage resolves: which cards are exposed vs selectable (is U shown-but-
 * unpickable or hidden?), is the pick mandatory, and after G is recycled does either seat's view of P2's deck carry G's identity?
 * (d) after resolution, are Defy and U redacted again in P1's live view?
 *
 * Expected: (a) No — the reveal is a resolution-time instruction: every P1 snapshot while Sabotage is pending shows three anonymous
 * cards and no P1 payload names a P2 hand card. (b) Defy goes on the (public) chain — P1 sees Defy there and P2's hand count drop
 * 3 → 2; Defy resolves first (LIFO) and counters Sabotage → Sabotage is put in P1's trash unresolved → the reveal never executes:
 * G and U never appear in any P1-visible payload. (c) on resolution ALL of {Defy, G, U} are revealed to P1 (and recorded as
 * revealed), but P1's options are only {Defy, G} — U is revealed-but-not-selectable; the pick is mandatory (min 1, no decline);
 * G goes to the bottom of P2's deck, and NEITHER seat's view of the deck shows G there (secret zone) — only the omniscient record
 * does. (d) yes — once Sabotage has finished resolving Defy and U are anonymous again to P1.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game, Viewer } from "../../../harness";
import { isHiddenView, P1, P2, SPECTATOR, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const DEFY = "ogn-045-298";
const SCRAPHEAP = "ogn-182-298"; // G — a gear
const VANGUARD_SERGEANT = "ogn-219-298"; // U — a unit
const FILLER = "ogn-175-298";

/**
 * P1's turn. P1: Sabotage + exactly 1 + [body]. P2: hand {Defy, G, U} with exactly 1 + [calm] open (Defy's cost); P2's Main Deck
 * is EXACTLY d1..d3 (top first) so the bottom placement is provable; P1 has its own small known deck.
 */
function board() {
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .deck(P1, [FILLER, FILLER, FILLER], ["p1d1", "p1d2", "p1d3"])
    .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .hand(P2, DEFY, "defy")
    .hand(P2, SCRAPHEAP, "gearG")
    .hand(P2, VANGUARD_SERGEANT, "unitU")
    .hand(P1, SABOTAGE, "sab");
}

const P2_HAND_IDS = ["defy", "gearG", "unitU"] as const;

/** P2's hand as `viewer` sees it: ids for visible cards, "?" for redacted ones. */
function p2HandSeenBy(game: Game, viewer: Viewer): string[] {
  return game.view(viewer).zones.hand.filter((c: CardView) => c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
}

/** P2's Main Deck as `viewer` sees it (top first). */
function p2DeckSeenBy(game: Game, viewer: Viewer): string[] {
  return game.view(viewer).zones.mainDeck.filter((c: CardView) => c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
}

/** Which of P2's three hand-card ids appear ANYWHERE in a serialized P1-side payload (observation + P1's decision/legal menu). */
function p1PayloadMentions(game: Game): string[] {
  const blob = JSON.stringify([game.p1.view(), game.p1.decision(), game.p1.legal()]);
  return P2_HAND_IDS.filter((id) => blob.includes(`"${id}"`));
}

/** Sabotage cast (the only opponent is implied) and P1 has passed → P2 holds priority with Sabotage pending. */
async function sabotagePendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sab");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …P2 answers with Defy on Sabotage; both pass → Defy resolves (counters Sabotage) and everything settles. */
async function defied(): Promise<Game> {
  const game = await sabotagePendingP2Priority();
  await game.p2.cast("defy", { targets: "sab" });
  await game.settle();
  return game;
}

/** …P2 passes instead → Sabotage resolves and P1 faces the reveal-and-pick. */
async function sabotageResolving(): Promise<Game> {
  const game = await sabotagePendingP2Priority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sab" } });
  return game;
}

describe("(a) Sabotage pending on the chain — nothing of P2's hand is exposed to P1 yet", () => {
  test("casting asks for no card (no targets field over P2's hand); 1 + [body] paid; Sabotage is the only chain item", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "sab")?.fields ?? []).toEqual([]);
    await game.p1.cast("sab");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sab", controller: P1, triggered: false })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // the opponent is a player choice, no card was chosen
  });

  test("every P1 snapshot while Sabotage is pending shows P2's hand as three ANONYMOUS cards (108.7.c) — before and after P1 passes priority to P2", async () => {
    const game = await board().build();
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?", "?"]);
    await game.p1.cast("sab");
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?", "?"]);
    expect(p1PayloadMentions(game)).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // "the opponent has been chosen" and holds priority…
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?", "?"]); // …yet nothing is revealed
    expect(p1PayloadMentions(game)).toEqual([]);
    // sanity: the owner and the omniscient view do see them
    expect(p2HandSeenBy(game, P2).sort()).toEqual(["defy", "gearG", "unitU"]);
    expect(p2HandSeenBy(game, SPECTATOR).sort()).toEqual(["defy", "gearG", "unitU"]);
  });
});

describe("(b) P2 Defies from that hand — the hand is NEVER revealed", () => {
  test("P2 may respond: Defy offers Sabotage (cost 1 ≤ 4, one power ≤ [rainbow]) and costs P2 exactly 1 + [calm]", async () => {
    const game = await sabotagePendingP2Priority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options).toEqual([["sab"]]);
    await game.p2.cast("defy", { targets: "sab" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sab", "defy"]);
  });

  test("what P1 legitimately learns: Defy by face on the PUBLIC chain (108.1.b) targeting Sabotage, and P2's hand count 3 → 2 (108.7.e) — the two remaining cards stay anonymous", async () => {
    const game = await sabotagePendingP2Priority();
    await game.p2.cast("defy", { targets: "sab" });
    const p1View = game.p1.view();
    expect(p1View.chain.map((c) => ({ cardId: c.cardId, controller: c.controller, name: c.name }))).toEqual([
      { cardId: "sab", controller: P1, name: "Sabotage" },
      { cardId: "defy", controller: P2, name: "Defy" },
    ]);
    expect(p1View.chain[1]?.targets).toEqual(["sab"]);
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?"]);
    expect(p1PayloadMentions(game)).toEqual(["defy"]); // Defy only — via the chain, not via the hand
  });

  test("Defy resolves first (LIFO) and counters Sabotage: both spells end in their owners' trashes, Sabotage never resolves — no reveal-and-pick is ever put to P1, P2's hand is exactly {G, U}, P2's deck untouched (425.1)", async () => {
    const game = await sabotagePendingP2Priority();
    await game.p2.cast("defy", { targets: "sab" });
    let sawRevealPrompt = false;
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
      const d = game.decision();
      sawRevealPrompt ||= d?.kind === "pick" && d.source?.cardId === "sab";
      expect(p1PayloadMentions(game).filter((id) => id !== "defy")).toEqual([]); // G and U never surface at any step
    }
    expect(sawRevealPrompt).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sab"]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toEqual(["defy"]);
    expect(game.p2.hand().sort()).toEqual(["gearG", "unitU"]);
    expect(game.p2.deck()).toEqual(["d1", "d2", "d3"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("end state of the Defy line from P1's chair: P2's hand = two anonymous cards; G and U appear in NO P1-visible payload; Defy is known only because it is face up in P2's (public) trash", async () => {
    const game = await defied();
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?"]);
    expect(p1PayloadMentions(game)).toEqual(["defy"]);
    const p1SeesP2Trash = game.p1.view().zones.trash.filter((c) => c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
    expect(p1SeesP2Trash).toEqual(["defy"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — P2 passes and Sabotage resolves", () => {
  test("ALL of P2's hand is revealed to P1 during the pick (424.3.a): P1's view names defy, gearG AND unitU; the engine's reveal record lists all three with P2 as revealer", async () => {
    const game = await sabotageResolving();
    expect(p2HandSeenBy(game, P1).sort()).toEqual(["defy", "gearG", "unitU"]);
    expect(game.gameState.pendingChoice).toMatchObject({ prompter: P1, revealed: ["defy", "gearG", "unitU"], revealer: P2, type: "reveal-and-pick" });
  });

  test("revealed ≠ selectable: P1's options are exactly the NON-units {Defy, G}; U is shown but not offered, and naming it is rejected", async () => {
    const game = await sabotageResolving();
    const d = game.decision();
    const options = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(options).toEqual(["defy", "gearG"]);
    expect(p2HandSeenBy(game, P1)).toContain("unitU"); // visible…
    expect(options).not.toContain("unitU"); // …but not an option
    expect((await game.p1.try((p) => p.pick("unitU"))).ok).toBe(false);
    expect(game.p2.hand().sort()).toEqual(["defy", "gearG", "unitU"]); // nothing moved
  });

  test("the pick is MANDATORY (no 'may'; the cards are public at that moment): min 1 / max 1 / no decline; declining is rejected", async () => {
    const game = await sabotageResolving();
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("P2 (the revealer) sees only a summary of P1's decision — it is P1's choice, not P2's", async () => {
    const game = await sabotageResolving();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.view().decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.view().decision).not.toHaveProperty("options");
  });

  test("picking G recycles it to the BOTTOM of P2's (owner's) Main Deck (416.1): omniscient order d1, d2, d3, G; P2 hand = {Defy, U}; Sabotage → P1's trash", async () => {
    const game = await sabotageResolving();
    await game.p1.pick("gearG");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("gearG")).toBe("mainDeck");
    expect(game.state("gearG").owner).toBe(P2);
    expect(p2DeckSeenBy(game, SPECTATOR)).toEqual(["d1", "d2", "d3", "gearG"]); // only the omniscient record knows
    expect(game.p2.hand().sort()).toEqual(["defy", "unitU"]);
    expect(game.p1.trash()).toEqual(["sab"]);
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2", "p1d3"]);
    expect(game.violations()).toEqual([]);
  });

  test("the Main Deck is SECRET (108.4.d / 128.3): after the recycle NEITHER P1's nor P2's view of P2's deck carries G's identity at any position", async () => {
    const game = await sabotageResolving();
    await game.p1.pick("gearG");
    await game.settle();
    expect(p2DeckSeenBy(game, P1)).toEqual(["?", "?", "?", "?"]);
    expect(p2DeckSeenBy(game, P2)).toEqual(["?", "?", "?", "?"]);
    expect(JSON.stringify(game.p1.view().zones.mainDeck)).not.toContain("gearG");
    expect(JSON.stringify(game.p2.view().zones.mainDeck)).not.toContain("gearG");
  });
});

describe("(d) after Sabotage finishes resolving the Revealed state ends (424.1.a.3)", () => {
  test("Defy and U are anonymous again in P1's live view; no P1 payload names any of defy / gearG / unitU any more", async () => {
    const game = await sabotageResolving();
    expect(p2HandSeenBy(game, P1).sort()).toEqual(["defy", "gearG", "unitU"]); // during
    await game.p1.pick("gearG");
    await game.settle();
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(p2HandSeenBy(game, P1)).toEqual(["?", "?"]); // after
    expect(p1PayloadMentions(game)).toEqual([]);
    expect(p2HandSeenBy(game, P2).sort()).toEqual(["defy", "unitU"]); // the owner still sees its own hand
  });
});
