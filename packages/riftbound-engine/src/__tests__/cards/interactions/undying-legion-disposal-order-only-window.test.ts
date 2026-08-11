/**
 * Interaction: Undying Legion (unl-025-219) × Disposal Order (unl-103-219) × Discipline (ogn-058-298)
 *   (+ Wind Wall ogn-064-298 for the counter variant)
 *
 *   Undying Legion — Fury unit, 3, 3 Might: "[Legion][>] You may play me from your trash for [3][fury].
 *     (Get the effect if you've played another card this turn.)"
 *   Disposal Order — Body spell, 2, [Reaction]: "Choose one — Choose up to 3 cards from opponents' trashes.
 *     Their owners recycle them. • Draw 1."
 *   Discipline — Calm spell, 2, [Reaction]: "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Question: Undying Legion sits in P1's trash; P2 holds Disposal Order. P1's turn, nothing played yet.
 * (a) P1 plays a vanilla UNIT then immediately Undying Legion from trash — did P2 ever get a window? Can P2
 * respond to the Legion play by recycling it "from the trash"? (b) P1's first card is Discipline: when does
 * the permission switch on, can P1 play the Legion in response to its own spell, where is P2's window and
 * what happens if P2 uses it? (c) P2 counters Discipline instead — is Legion still on? (d) After a successful
 * Disposal Order, is the trash play still in P1's menu and does either seat learn the recycled card's deck slot?
 *
 * Rules: 354.1 / 337.2 (a permanent play resolves immediately, no Reaction window), 337.4 (turn player gets
 * priority first on a chain), 355.9.a (only a card IN an opponent's trash can be chosen), 812.1.c / 419.4.b
 * (Legion keys off FINALIZATION — a countered card still counts), 358.4 (a unit without [Reaction] cannot join
 * a chain), 416.1.c / 416.5 (owner recycles to the bottom), 359.3.e.4 (left the zone → new object), 128.3
 * (deck is Secret), 143.4 (enters exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNDYING_LEGION = "unl-025-219";
const DISPOSAL_ORDER = "unl-103-219";
const DISCIPLINE = "ogn-058-298";
const WIND_WALL = "ogn-064-298";
const RECRUIT = { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Cheap Recruit" };

/**
 * P1's turn, nothing played. P1: Undying Legion in trash, Recruit (1) + Discipline (2) in hand, Buddy in base
 * (Discipline's target), 6 energy + 1 fury (enough for any line incl. the [3][fury] trash play).
 * P2: Disposal Order (2) + Wind Wall (3+cc) in hand, 5 energy + 2 calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .resources(P2, { energy: 5, power: { calm: 2 } })
    .trash(P1, UNDYING_LEGION, "ul")
    .hand(P1, RECRUIT, "recruit")
    .hand(P1, DISCIPLINE, "disc")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P2, DISPOSAL_ORDER, "dispo")
    .hand(P2, WIND_WALL, "ww");
}

function seesOf(game: Game, viewer: "p1" | "p2", zone: "mainDeck" | "trash", owner: string): string[] {
  const cards = (game[viewer].view().zones[zone] ?? []) as readonly CardView[];
  return cards.filter((c) => c.owner === owner).map((c) => ("hidden" in c && c.hidden ? "hidden" : (c as { id: string }).id));
}

/** P1 casts Discipline on Buddy and passes; P2 answers with Disposal Order (recycle mode) naming Undying Legion. */
async function disciplineThenDisposal(game: Game): Promise<void> {
  await game.p1.cast("disc", { targets: "buddy" });
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 337.4 — P1 first
  await game.p1.pass();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("dispo", { mode: 0, targets: ["ul"] });
}

describe("Undying Legion vs Disposal Order — the only window is a chain P1 opens", () => {
  test("baseline: with nothing played this turn the trash play is OFF, and P2 (not acting on P1's open turn) has no menu at all", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
  });

  test("(a) unit first: the Recruit play resolves at once with no Reaction window (354.1/337.2) — the decision comes straight back to P1's main phase, P2 never acts, and Undying Legion is now playable from the trash", async () => {
    const game = await board().build();
    await game.p1.play("recruit", { to: "base" });
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p1.can("play", "ul")).toBe(true);
  });

  test("(a) …then Undying Legion from the trash: again no window for P2 (it left the trash as step 1 of the play — no longer 'a card in an opponent's trash', 355.9.a); pays exactly [3][fury], enters base exhausted (143.4), counts as a play", async () => {
    const game = await board().build();
    await game.p1.play("recruit", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } });
    await game.p1.play("ul", { to: "base" });
    expect(game.p2.legal()).toEqual([]); // P2 never held priority anywhere in this line
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.state("ul")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    // Disposal Order can no longer name it even once P2 does get a chain later.
    await game.p1.cast("disc", { targets: "buddy" });
    await game.p1.pass();
    const field = game.p2.option("cast", "dispo")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat().filter((x) => x !== null)).not.toContain("ul");
  });

  test("(b) spell first: Legion's condition is met at Discipline's FINALIZATION (tally 1 while it is still on the chain, 812.1.c) — but a unit with no [Reaction] cannot join the closed chain (358.4): the trash play is NOT in P1's menu while it holds priority", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "buddy" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1 })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.legal().map((o) => o.key).sort()).toEqual(["concede:-", "passChainPriority:-"]);
    await expect(game.p1.play("ul", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("ul")).toBe("trash");
  });

  test("(b) Discipline's chain IS P2's window: after P1 passes, Disposal Order (recycle mode) offers exactly the cards in P1's trash — Undying Legion — and goes on top of Discipline", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "buddy" });
    await game.p1.pass();
    expect(game.p2.can("cast", "dispo")).toBe(true);
    const opt = game.p2.option("cast", "dispo");
    const targets = opt?.fields.find((f) => f.name === "targets");
    expect([...new Set((targets?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : []) as string[]))]).toEqual(["ul"]);
    expect(opt?.fields.find((f) => f.name === "mode")?.labels).toEqual(["Recycle up to 3 from opponents' trashes", "Draw 1"]);
    await game.p2.cast("dispo", { mode: 0, targets: ["ul"] });
    expect(game.p2.energy()).toBe(3);
    expect(game.p1.view().chain).toEqual([
      expect.objectContaining({ cardId: "disc", controller: P1, targets: ["buddy"] }),
      expect.objectContaining({ cardId: "dispo", controller: P2, mode: 0, targets: ["ul"] }),
    ]);
  });

  test("(b) LIFO: Disposal Order resolves first → P1 (the OWNER) recycles Undying Legion to the bottom of P1's deck (416.1.c); then Discipline resolves (+2, draw 1); afterwards the trash play is GONE from P1's menu (359.3.e.4)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await disciplineThenDisposal(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ul")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ul"); // omniscient check: owner's deck, bottom
    expect(game.p2.deck()).not.toContain("ul");
    expect(game.state("buddy").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // − Discipline + draw 1
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("dispo")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.legal().map((o) => o.key)).not.toContain("playUnit:ul");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } }); // the [3][fury] was never spent
  });

  test("(d) after the recycle neither seat's VIEW names the card or its slot in P1's Secret deck (128.3) — every P1 deck entry is redacted for P1 and for P2; the public trash simply no longer lists it", async () => {
    const game = await board().build();
    await disciplineThenDisposal(game);
    await game.settle();
    const p1Deck = seesOf(game, "p1", "mainDeck", P1);
    const p2SeesP1Deck = seesOf(game, "p2", "mainDeck", P1);
    expect(p1Deck.length).toBeGreaterThan(0);
    expect(p1Deck.every((x) => x === "hidden")).toBe(true);
    expect(p2SeesP1Deck.every((x) => x === "hidden")).toBe(true);
    expect(p2SeesP1Deck).toHaveLength(p1Deck.length);
    expect(seesOf(game, "p2", "trash", P1)).toEqual(["disc"]); // trash is public: Legion visibly gone, Discipline there
    expect(seesOf(game, "p1", "trash", P1)).toEqual(["disc"]);
  });

  test("(c) P2 counters Discipline with Wind Wall instead: the countered card still counts as FINALIZED (419.4.b) → once the chain empties P1 may play Undying Legion from the trash for [3][fury]; it enters exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "buddy" });
    await game.p1.pass();
    await game.p2.cast("ww", { targets: "disc" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("buddy").might).toBe(2); // countered: no +2, no draw
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("play", "ul")).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    await game.p1.play("ul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // alternative cost replaces the printed 3
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.state("ul")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("(c') same if nobody responds and Discipline simply resolves: Legion on, trash play offered and playable", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "buddy" });
    await game.settle();
    expect(game.state("buddy").might).toBe(4);
    expect(game.p1.can("play", "ul")).toBe(true);
    await game.p1.play("ul", { to: "base" });
    expect(game.zoneOf("ul")).toBe("base");
  });
});
