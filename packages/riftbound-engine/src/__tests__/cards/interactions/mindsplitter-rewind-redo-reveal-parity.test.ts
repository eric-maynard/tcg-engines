/**
 * Interaction: Mindsplitter (ogn-192-298) · Unit · Chaos · [7][chaos][chaos] · 7 Might
 *     "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard
 *      that card."
 *   × Scuttle Crab (unl-053-219) · Unit · Calm · [2] · 0 Might
 *     "[Deathknell][>] Choose an opponent. They reveal their hand. You can look at their facedown cards this
 *      turn. Gain 1 XP."
 *
 * Rules: 337.2 (a Unit chain item resolves immediately once finalized — the play trigger is the part that waits),
 * 340.1 (the newest finalized item resolves, executing its effects in their entirety), 424.1.a.2 (a Revealed card
 * stays in the zone it is revealed from), 424.1.a.3 (the Revealed state lasts only until the resolution of the
 * ability that applied it finishes), 424.2.b (showing Private information is not revealing), 128.3 (a deck is
 * Secret — NO player may look), 128.4 (a hand is Private — only its owner may look).
 *
 * Question — reproduce and pin the monkey run's snapshot drift. P1's Scuttle Crab has already died this turn, so
 * its Deathknell handed P1 "you can look at their facedown cards this turn" plus 1 XP; P1 then plays Mindsplitter
 * and the chain resolves into a REVEAL prompt. Rewind while that prompt is OPEN, then Redo.
 *   (a) Is the position byte-identical for BOTH seats — same prompt reopened, same option list, same
 *       revealed-to-whom, same hand and deck ORDER, same XP — or does Redo re-roll or leak?
 *   (b) Does Rewind past the Deathknell REVOKE the facedown-look grant rather than only rolling back the board,
 *       and does Redo restore it exactly once (no double grant, no double XP)?
 *
 * Answer: (a) yes — one Rewind takes back exactly the pass that resolved Mindsplitter's trigger, and one Redo
 * restores a byte-identical position: the same `reveal-and-pick` prompt for P1, the same two options in the same
 * order, the same audience (P1 sees P2's hand, P2 does not see P1's, neither seat's deck order widens), the same
 * XP. (b) yes — the grant and the XP live in the Deathknell's own undo group: rewinding past it redacts P1's view
 * of the facedown card again and takes the XP back, and redoing forward re-applies each exactly once.
 *
 * Privacy check that rides along: the Deathknell's "they reveal their hand" is ONE-SHOT (424.1.a.3) — once it has
 * finished resolving, P1's live view of P2's hand is redacted again, and it is only Mindsplitter's own resolution
 * that re-opens it.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MINDSPLITTER = "ogn-192-298";
const SCUTTLE_CRAB = "unl-053-219";
const CONSULT_THE_PAST = "ogn-083-298"; // P2's facedown card — what the look grant is about
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla

/** P1's free [Action] "Kill a unit." — the lever that kills P1's own Crab on P1's turn. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Execute",
  rulesText: "Kill a unit.",
  timing: "action",
} as const;

/** Ids of a zone AS `viewer` sees it — "HIDDEN" for every slot the viewer may not read (128.3 / 128.4). */
function seenBy(game: Game, viewer: Seat, zone: string, owner?: Seat): string[] {
  return (game.seat(viewer).view().zones[zone] ?? [])
    .filter((c) => owner === undefined || c.owner === owner)
    .map((c) => ("hidden" in c && c.hidden === true ? "HIDDEN" : (c as { id: string }).id));
}

/** The decision as data, minus the monotonically increasing decision id (not part of the position). */
function promptShape(game: Game): unknown {
  const d = game.decision();
  if (!d) {
    return null;
  }
  const { id: _id, ...rest } = d as { id: string } & Record<string, unknown>;
  return JSON.parse(JSON.stringify(rest));
}

/** Everything the two seats can see, canonicalised: what a "byte-identical for both seats" claim means. */
function bothSeatsFrame(game: Game): string {
  return JSON.stringify({
    decks: { p1: game.p1.deck(), p2: game.p2.deck() }, // real order (spectator)
    p1: {
      deckSeen: seenBy(game, P1, "mainDeck", P1),
      facedownBf2: seenBy(game, P1, "facedown-bf2"),
      hand: seenBy(game, P1, "hand", P1),
      p2DeckSeen: seenBy(game, P1, "mainDeck", P2),
      p2Hand: seenBy(game, P1, "hand", P2),
      points: game.p1.points(),
      xp: game.p1.xp(),
    },
    p2: {
      deckSeen: seenBy(game, P2, "mainDeck", P2),
      facedownBf2: seenBy(game, P2, "facedown-bf2"),
      hand: seenBy(game, P2, "hand", P2),
      p1Hand: seenBy(game, P2, "hand", P1),
      p1DeckSeen: seenBy(game, P2, "mainDeck", P1),
      points: game.p2.points(),
      xp: game.p2.xp(),
    },
    prompt: promptShape(game),
    publicReveals: game.gameState.publicReveals ?? [],
  });
}

/**
 * Turn 2, P1's open Main Phase. P1: Scuttle Crab in base, exactly Mindsplitter's cost in the pool, a free kill
 * spell and Mindsplitter in hand, a deck of three named cards on top. P2: a guard and a facedown Consult the
 * Past at bf2 (the thing the look grant is about), two known cards in hand, its own named deck top.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "theirFacedown")
    .unit(P1, "base", SCUTTLE_CRAB, "crab")
    .hand(P1, EXECUTE, "exec")
    .hand(P1, MINDSPLITTER, "ms")
    .hand(P2, FILLER, "a")
    .hand(P2, FILLER, "b")
    .deck(P1, [FILLER, FILLER, FILLER], ["p1d1", "p1d2", "p1d3"])
    .deck(P2, [FILLER, FILLER, FILLER], ["p2d1", "p2d2", "p2d3"]);
}

/** Step 1: P1 kills its own Crab; the Deathknell resolves naming P2 → 1 XP + the facedown-look grant. */
async function crabDied(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("exec", { targets: "crab" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(P2); // "Choose an opponent"
    await game.settle();
  }
  expect(game.zoneOf("crab")).toBe("trash");
  expect(game.p1.xp()).toBe(1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Step 2: P1 plays Mindsplitter and settles onto the open reveal prompt. */
async function atRevealPrompt(): Promise<Game> {
  const game = await crabDied();
  await game.p1.play("ms");
  const settled = await game.settle();
  expect(settled.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({
    kind: "pick",
    seat: P1,
    semantics: "from-revealed",
    source: { cardId: "ms", pendingChoiceType: "reveal-and-pick" },
  });
  return game;
}

describe("Mindsplitter's reveal prompt across Rewind/Redo — per-seat snapshot parity, and the Scuttle Crab grant", () => {
  // ── premise ───────────────────────────────────────────────────────────────────────────────────────

  test("premise: after the Deathknell P1 has 1 XP and can LOOK at P2's facedown card, while P2's HAND is redacted again — the Deathknell's reveal was one-shot (424.1.a.3), not a turn-long window", async () => {
    const game = await crabDied();
    expect(seenBy(game, P1, "facedown-bf2")).toEqual(["theirFacedown"]);
    expect(seenBy(game, P2, "facedown-bf2")).toEqual(["theirFacedown"]);
    expect(seenBy(game, P1, "hand", P2)).toEqual(["HIDDEN", "HIDDEN"]);
    expect(game.gameState.publicReveals ?? []).toEqual([{ cardIds: ["a", "b"], playerId: P2, turn: 2 }]);
  });

  test("premise: Mindsplitter itself resolves the instant it is finalized (337.2) — it is in the base with the pool paid, and only its play TRIGGER waits to resolve into the reveal (340.1)", async () => {
    const game = await crabDied();
    await game.p1.play("ms");
    expect(game.zoneOf("ms")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", controller: P1, triggered: true })]);
  });

  // ── the reveal prompt itself ─────────────────────────────────────────────────────────────────────

  test("at the prompt: P2's whole hand is presented to the chooser and stays IN the hand (424.1.a.2); P2 never sees P1's hand and neither deck's order widens (128.3 / 128.4)", async () => {
    const game = await atRevealPrompt();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["a", "b"]);
    expect(d?.kind === "pick" ? { allowDecline: d.allowDecline, max: d.max, min: d.min } : null).toEqual({
      allowDecline: false,
      max: 1,
      min: 1,
    });
    expect(game.p2.hand()).toEqual(["a", "b"]); // still in hand — a Reveal is not a zone change
    expect(seenBy(game, P1, "hand", P2)).toEqual(["a", "b"]);
    expect(seenBy(game, P2, "hand", P1)).toEqual([]); // P1's hand is empty here, but never widened either way
    expect(seenBy(game, P1, "mainDeck", P1).every((v) => v === "HIDDEN")).toBe(true);
    expect(seenBy(game, P1, "mainDeck", P2).every((v) => v === "HIDDEN")).toBe(true);
    expect(seenBy(game, P2, "mainDeck", P1).every((v) => v === "HIDDEN")).toBe(true);
  });

  // ── (a) one Rewind, one Redo, with the prompt open ───────────────────────────────────────────────

  test("(a) ONE Rewind with the prompt open takes back exactly the pass that resolved the trigger: the prompt is gone, Mindsplitter is still on the board with its item on the chain, and P2's hand is redacted again", async () => {
    const game = await atRevealPrompt();
    expect(game.undo()).toBe(true);
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("ms")).toBe("base");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ms"]);
    expect(seenBy(game, P1, "hand", P2)).toEqual(["HIDDEN", "HIDDEN"]);
    expect(game.p2.hand()).toEqual(["a", "b"]); // nothing was discarded
  });

  test("(a) Redo restores a BYTE-IDENTICAL position and the identical prompt — same option list in the same order, same reveal audience, same hand and deck order, same XP, for BOTH seats", async () => {
    const game = await atRevealPrompt();
    const hashAtPrompt = game.snapshotHash();
    const frameAtPrompt = bothSeatsFrame(game);
    const promptAtPrompt = promptShape(game);

    expect(game.undo()).toBe(true);
    expect(game.snapshotHash()).not.toBe(hashAtPrompt);

    expect(game.redo()).toBe(true);
    expect(game.snapshotHash()).toBe(hashAtPrompt);
    expect(bothSeatsFrame(game)).toBe(frameAtPrompt);
    expect(promptShape(game)).toEqual(promptAtPrompt);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the round trip is not just cosmetic: answering after Rewind+Redo produces exactly the answer-without-a-round-trip result (P2 discards the named card, keeps the other, P1's hand untouched)", async () => {
    const straight = await atRevealPrompt();
    await straight.p1.pick("a");
    await straight.settle();
    const straightFrame = bothSeatsFrame(straight);

    const rewound = await atRevealPrompt();
    expect(rewound.undo()).toBe(true);
    expect(rewound.redo()).toBe(true);
    await rewound.p1.pick("a");
    await rewound.settle();
    expect(bothSeatsFrame(rewound)).toBe(straightFrame);
    expect(rewound.p2.trash()).toEqual(["a"]);
    expect(rewound.p2.hand()).toEqual(["b"]);
    expect(rewound.snapshotHash()).toBe(straight.snapshotHash());
    expect(rewound.violations()).toEqual([]);
  });

  // ── rewinding past the play ──────────────────────────────────────────────────────────────────────

  test("Rewinding all the way past the play puts Mindsplitter back in hand with the pool refunded, no reveal and no prompt — and leaves the Crab's XP and look grant alone (a different undo group)", async () => {
    const game = await crabDied();
    const hashBeforePlay = game.snapshotHash();
    const frameBeforePlay = bothSeatsFrame(game);
    await game.p1.play("ms");
    await game.settle();

    for (let i = 0; i < 8 && game.canUndo() && game.zoneOf("ms") !== "hand"; i++) {
      game.undo();
      if (game.decision()?.kind === "pick") {
        // a reveal prompt may never outlive the item that raised it
        expect(game.chain().map((c) => c.cardId)).toContain("ms");
      }
    }
    expect(game.zoneOf("ms")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 7, power: { chaos: 2 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1); // the Deathknell is untouched …
    expect(seenBy(game, P1, "facedown-bf2")).toEqual(["theirFacedown"]); // … grant intact
    expect(game.snapshotHash()).toBe(hashBeforePlay);
    expect(bothSeatsFrame(game)).toBe(frameBeforePlay);
  });

  // ── (b) rewinding past the Deathknell revokes the grant AND the XP ──────────────────────────────

  test("(b) Rewinding past the Deathknell REVOKES the grant, not just the board: P1's view of facedown-bf2 is an anonymous slot again and the XP is taken back", async () => {
    const game = await atRevealPrompt();
    for (let i = 0; i < 12 && game.canUndo() && game.p1.xp() > 0; i++) {
      game.undo();
    }
    expect(game.p1.xp()).toBe(0);
    expect(seenBy(game, P1, "facedown-bf2")).toEqual(["HIDDEN"]);
    expect(seenBy(game, P2, "facedown-bf2")).toEqual(["theirFacedown"]); // its own controller always could
    expect(seenBy(game, P1, "hand", P2)).toEqual(["HIDDEN", "HIDDEN"]);
    expect(game.zoneOf("ms")).toBe("hand");
  });

  test("(b) Redoing forward re-applies each step EXACTLY ONCE — XP is 1 (never 2), the look grant is back, the public reveal record is not duplicated, and the prompt frame matches the original byte for byte", async () => {
    const game = await atRevealPrompt();
    const hashAtPrompt = game.snapshotHash();
    const frameAtPrompt = bothSeatsFrame(game);
    const revealsAtPrompt = JSON.stringify(game.gameState.publicReveals ?? []);

    for (let i = 0; i < 12 && game.canUndo() && game.p1.xp() > 0; i++) {
      game.undo();
    }
    expect(game.p1.xp()).toBe(0);

    for (let i = 0; i < 24 && game.canRedo(); i++) {
      game.redo();
    }
    expect(game.p1.xp()).toBe(1);
    expect(seenBy(game, P1, "facedown-bf2")).toEqual(["theirFacedown"]);
    expect(JSON.stringify(game.gameState.publicReveals ?? [])).toBe(revealsAtPrompt);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(game.snapshotHash()).toBe(hashAtPrompt);
    expect(bothSeatsFrame(game)).toBe(frameAtPrompt);
    expect(game.violations()).toEqual([]);
  });

  test("(b) …and the redone position still answers identically: the deck ORDER of both seats is unchanged throughout, and the discard lands on the card P1 names", async () => {
    const game = await atRevealPrompt();
    const decks = { p1: game.p1.deck(), p2: game.p2.deck() };
    for (let i = 0; i < 12 && game.canUndo() && game.p1.xp() > 0; i++) {
      game.undo();
    }
    expect({ p1: game.p1.deck(), p2: game.p2.deck() }).toEqual(decks); // no re-shuffle on the way back
    for (let i = 0; i < 24 && game.canRedo(); i++) {
      game.redo();
    }
    expect({ p1: game.p1.deck(), p2: game.p2.deck() }).toEqual(decks); // …nor on the way forward
    await game.p1.pick("b");
    await game.settle();
    expect(game.p2.trash()).toEqual(["b"]);
    expect(game.p2.hand()).toEqual(["a"]);
    expect({ p1: game.p1.deck(), p2: game.p2.deck() }).toEqual(decks);
    expect(seenBy(game, P1, "hand", P2)).toEqual(["HIDDEN"]); // 424.1.a.3 — the reveal ended with the resolution
    expect(game.violations()).toEqual([]);
  });
});
