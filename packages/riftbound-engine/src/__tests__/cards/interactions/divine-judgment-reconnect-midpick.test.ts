/**
 * Interaction: Divine Judgment (ogn-244-298) "Each player chooses 2 units, 2 gear, 2 runes, and
 *              2 cards in their hands. Recycle the rest."
 *            × Trove Golem (sfd-174-221) "When you play me, play four Gold gear tokens exhausted."
 *
 * Q: With four Gold tokens on the board the "choose 2 gear" is a real choice, not a formality.
 *    Mid-prompt — after answering one slot but before the rest — the client reconnects (hard
 *    reload, or a dropped socket). Does the server hand back the identical pending choice for
 *    that seat only, never a blank board, never a double-apply on confirm, and never leaving the
 *    other seat waiting? And: facedown [Hidden] cards must appear in no pick list, while a seat
 *    holding fewer than 2 of a category must not deadlock.
 *
 * Rules:
 *   355.6      each player chooses 2 of each category; everything else is recycled
 *   424.2.b    Recycle = put on the BOTTOM of the corresponding deck (Main Deck / Rune Deck)
 *   128.4      a player's hand is private — an opponent never sees its contents
 *   359.3.e.6  an instruction that cannot be carried out (a category with nothing spare) is ignored
 *   186.1      a token that leaves the board ceases to exist
 * Rulings: 164749cef0cce61e (a player with one unit simply keeps it — never a "pick 2 distinct"
 *          deadlock), 16781c980e39e522 (facedown/hidden cards are not units/gear/cards in hand
 *          and are neither selectable nor recycled).
 *
 * There is no browser here, so "reconnect" is modelled the way the server actually serves one:
 * the client is thrown away and the seat's view is re-derived from the authoritative state
 * (`game.view(seat)`), and a confirm that races the reload cites the decision id it was rendered
 * from (`decisionId`) — a stale id must be refused rather than applied a second time.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DecisionSummary, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const TROVE_GOLEM = "sfd-174-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker — a vanilla 3-might unit, used as hand filler
const HIDDEN_CARD = "sfd-202-221"; // Hostile Takeover — something to sit facedown at bf1

/**
 * P1: a battlefield they hold, 2 units + the Golem to come, 3 runes, 3 spare hand cards and a
 * facedown card at bf1. P2 is under the limit everywhere, so P2 is never asked.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .runes(P1, "order", 3)
    .hand(P1, TROVE_GOLEM, "golem")
    .hand(P1, DIVINE_JUDGMENT, "dj")
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .hand(P1, FILLER, "h3")
    .facedown(P1, "bf1", HIDDEN_CARD, "sneak")
    .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs");
}

/** Play the Golem (four Gold tokens land), refill, cast Divine Judgment, stop at the first prompt. */
async function goldenBoard(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("golem");
  await game.settle();
  expect(game.p1.gear()).toEqual(["token-gold-1", "token-gold-2", "token-gold-3", "token-gold-4"]);
  await game.p1.do("addResources", { energy: 7, power: { order: 2 } });
  await game.p1.cast("dj");
  await game.settle();
  return game;
}

/** Answer every remaining recycle prompt with its first option; returns the prompts that were shown. */
async function drain(game: Game): Promise<PickDecision[]> {
  const seen: PickDecision[] = [];
  for (let i = 0; i < 20; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.kind).toBe("pick");
    const pick = d as PickDecision;
    seen.push(pick);
    await game.seat(pick.seat).pick(pick.options[0]!.key);
  }
  return seen;
}

describe("Divine Judgment × Trove Golem — reconnecting in the middle of the pick", () => {
  test("the four Gold tokens make 'choose 2 gear' a real choice: all four are on the menu, two survive, two cease to exist (355.6, 186.1)", async () => {
    const game = await goldenBoard();
    const prompts = await drain(game);
    const gearPrompt = prompts.find((p) => p.options.every((o) => String(o.card ?? o.key).startsWith("token-gold")));
    expect(gearPrompt).toBeDefined();
    expect(gearPrompt?.options.map((o) => o.card ?? o.key)).toEqual([
      "token-gold-1",
      "token-gold-2",
      "token-gold-3",
      "token-gold-4",
    ]);
    expect(game.p1.gear()).toEqual(["token-gold-3", "token-gold-4"]);
    for (const gone of ["token-gold-1", "token-gold-2"]) {
      expect(game.has(gone)).toBe(false); // 186.1 — a recycled token simply stops existing
    }
    expect(game.violations()).toEqual([]);
  });

  test("424.2.b — everything not chosen goes to the BOTTOM of its own deck: units/hand cards → Main Deck, runes → Rune Deck", async () => {
    const game = await goldenBoard();
    const runeDeckBefore = game.p1.runeDeck().length;
    await drain(game);
    expect(game.p1.units().toSorted()).toEqual(["golem", "holder"]);
    expect(game.zoneOf("spare")).toBe("mainDeck");
    expect(game.p1.deck().slice(-2)).toContain("spare"); // bottom of the deck, not the top
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("h1")).toBe("mainDeck");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore + 1);
    expect(game.zoneOf("dj")).toBe("trash");
  });

  test("HARD RELOAD mid-prompt: re-deriving the seat's whole view returns the identical pending choice — same id, same options, no blank board", async () => {
    const game = await goldenBoard();
    const first = game.decision() as PickDecision;
    expect(first.kind).toBe("pick");
    expect(first.seat).toBe(P1);

    // The client is discarded and the view rebuilt from the server snapshot, twice.
    const reload1 = game.view(P1);
    const reload2 = game.view(P1);
    expect(reload1.decision).toEqual(first);
    expect(reload2.decision).toEqual(first);
    // The board comes back with it — never blank.
    expect(reload1.battlefields.map((b) => b.id)).toContain("bf1");
    expect(reload1.zones.hand).toBeDefined();
    expect(game.p1.gear()).toHaveLength(4);
    expect(game.stateHash()).toBe(game.stateHash()); // reading changed nothing
  });

  test("SOCKET DROP mid-selection: the answer already given is durable — the re-served prompt names only what is still to decide", async () => {
    const game = await goldenBoard();
    const unitPrompt = game.decision() as PickDecision;
    expect(unitPrompt.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["golem", "holder", "spare"]);
    await game.p1.pick("spare");

    // "Socket drops, client reconnects": re-read the decision. The already-applied half is gone
    // from the state and the next slot is served cleanly — no partial ghost, no repeat.
    const after = game.view(P1).decision as Decision;
    expect(after.id).not.toBe(unitPrompt.id);
    expect(game.p1.units().toSorted()).toEqual(["golem", "holder"]);
    expect(game.zoneOf("spare")).toBe("mainDeck");
    expect(after.kind).toBe("pick");
    expect((after as PickDecision).options.map((o) => o.card ?? o.key)).toEqual([
      "token-gold-1",
      "token-gold-2",
      "token-gold-3",
      "token-gold-4",
    ]);
  });

  test("no double-apply: a confirm that races the reload cites the decision it was rendered from and is refused as stale", async () => {
    const game = await goldenBoard();
    const unitPrompt = game.decision() as PickDecision;
    const key = unitPrompt.options.find((o) => (o.card ?? o.key) === "spare")!.key;
    await game.p1.pick("spare");
    const unitsAfterFirst = game.p1.units().toSorted();

    const replay = await game.act(P1, { decisionId: unitPrompt.id, keys: [key], kind: "pick" });
    expect(replay.ok).toBe(false);
    expect(replay.ok === false && replay.error.code).toBe("STALE_DECISION");
    expect(game.p1.units().toSorted()).toEqual(unitsAfterFirst); // exactly once
    expect(game.zoneOf("spare")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("128.4 — the opponent's reconnect gets a redacted summary of P1's hand prompt: kind and seat, never the card list", async () => {
    const game = await goldenBoard();
    await game.p1.pick("spare"); // units
    await drainUntilHandPrompt(game);
    const mine = game.decision() as PickDecision;
    expect(mine.seat).toBe(P1);
    expect(mine.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["h1", "h2", "h3"]);

    const theirs = game.view(P2).decision as DecisionSummary;
    expect(theirs).toMatchObject({ id: mine.id, kind: "pick", seat: P1 });
    expect((theirs as unknown as { options?: unknown }).options).toBeUndefined();
    expect(JSON.stringify(theirs)).not.toContain("h1");
    // P2 also cannot answer it.
    const stolen = await game.act(P2, { keys: [mine.options[0]!.key], kind: "pick" });
    expect(stolen.ok).toBe(false);
    expect(stolen.ok === false && stolen.error.code).toBe("NOT_YOUR_DECISION");
  });

  test("ruling 16781c980e39e522 — the facedown card at bf1 is in NO pick list and is not recycled", async () => {
    const game = await goldenBoard();
    const prompts = await drain(game);
    for (const p of prompts) {
      expect(p.options.map((o) => o.card ?? o.key)).not.toContain("sneak");
    }
    expect(game.zoneOf("sneak")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["sneak"]);
  });

  test("ruling 164749cef0cce61e / 359.3.e.6 — a seat under the limit is never asked, never deadlocks on 'pick 2 distinct', and never leaves the other seat waiting", async () => {
    const game = await goldenBoard();
    const prompts = await drain(game);
    expect(prompts.every((p) => p.seat === P1)).toBe(true); // P2 has 1 unit, 0 gear, ≤2 in hand
    expect(game.p2.units()).toEqual(["theirs"]); // their single unit fills both slots — it stays
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

/** Answer prompts until the hand category (h1/h2/h3) is the one on the cursor. */
async function drainUntilHandPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind !== "pick") {
      break;
    }
    const names = (d as PickDecision).options.map((o) => String(o.card ?? o.key));
    if (names.includes("h1")) {
      return;
    }
    await game.seat(d.seat).pick((d as PickDecision).options[0]!.key);
  }
  throw new Error("hand prompt never appeared");
}
