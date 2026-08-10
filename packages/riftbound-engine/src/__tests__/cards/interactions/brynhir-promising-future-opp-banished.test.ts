/**
 * Interaction: Brynhir Thundersong (ogn-026-298) · Unit · Fury · 6 · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the
 *      rest. Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   (props: Discipline ogn-058-298 — a Reaction spell in P2's hand; Consult the Past ogn-083-298 — a
 *    facedown card at P2's battlefield; Seal of Focus ogn-081-298 — P2's gear "[Exhaust]: [Reaction] —
 *    [Add] [calm]"; a ready calm rune of P2's.)
 *
 * Rules: 054.1 (can't beats can), 055 / 358.3.a / 359.3.e.6 (an instruction made impossible by a
 * prohibition is simply skipped — the rest of the effect still happens), 419.1 (playing = putting a card on
 * the chain; a facedown flip is playing a card, 811.1.c.3), 354.2 (plays made during a resolution become
 * Pending items finalized afterwards), 416.1.c (each player recycles to their OWN deck).
 *
 * Q: P1's turn. P1 plays Brynhir to base and her trigger resolves; P1 then casts Promising Future. P2's top
 * 5 hold vanilla U2 (P2 banishes it); P1 banishes vanilla U1.
 *   (a) P2's action set during the PF chain → no 'play' options at all (no hand Reaction, no facedown flip),
 *       but rune tap/recycle and the Seal's [Add] remain.
 *   (b) P2 still looks / banishes / recycles (those aren't 'playing').
 *   (c) U2 is NOT played — stays in P2's banishment (not trash/deck/board), never a chain item.
 *   (d) U1 IS played (Brynhir binds opponents only) → P1's base; P1 board = Brynhir + U1.
 *   (e) Contrast: no Brynhir first → both U2 (next player first) and U1 enter. Brynhir banished off PF by
 *       P1 → U2 is finalized before her trigger exists, so U2 still enters.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const PROMISING_FUTURE = "ogn-115-298";
const DISCIPLINE = "ogn-058-298"; // Reaction spell, 2 calm
const CONSULT_THE_PAST = "ogn-083-298"; // Hidden + Reaction spell
const SEAL_OF_FOCUS = "ogn-081-298"; // gear: [Exhaust]: [Reaction] — [Add] [calm]
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;
const U1 = { cardType: "unit", energyCost: 4, might: 4, name: "Unit One" } as const;
const U2 = { cardType: "unit", energyCost: 4, might: 4, name: "Unit Two" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: 11 energy + [mind] (Brynhir 6, then PF 5+[mind] → exactly 0 left), Brynhir + PF in hand,
 * deck topped by `p1Top` (default U1) then fillers. P2: Discipline in hand with 2 energy + [calm] to pay
 * for it, a facedown Consult the Past at its own battlefield, Seal of Focus in base, one ready calm rune;
 * deck topped by U2 then fillers. Each player holds one battlefield with a 2-Might unit.
 */
function board(p1Top: string | typeof U1 = U1) {
  return scenario()
    .resources(P1, { energy: 11, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bfP1", { controller: P1 })
    .battlefield("bfP2", { controller: P2 })
    .unit(P1, "bfP1", { might: 2, name: "P1 Holder" }, "p1holder")
    .unit(P2, "bfP2", { might: 2, name: "P2 Holder" }, "p2holder")
    .deck(P1, [p1Top, FILLER, FILLER, FILLER, FILLER, FILLER], ["u1", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [U2, FILLER, FILLER, FILLER, FILLER, FILLER], ["u2", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, BRYNHIR, "bryn")
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P2, DISCIPLINE, "disc2")
    .facedown(P2, "bfP2", CONSULT_THE_PAST, "hidden2")
    .gear(P2, SEAL_OF_FOCUS, "seal")
    .rune(P2, "calm", { alias: "r2" });
}

/** Step the game (passes / forced answers only) until `pred` holds for the current decision. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (pred(d)) {
      return d;
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  const d = game.decision();
  expect(pred(d)).toBe(true);
  return d;
}

const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";
const playKeys = (game: Game) =>
  game.p2
    .legal()
    .filter((o) => ["play", "cast", "equip", "reveal", "playFrom", "playChampion", "hide"].includes(o.verb))
    .map((o) => o.key);

/** P1 plays Brynhir to base; both pass so her trigger resolves; back in P1's open main phase. */
async function brynhirResolved(game: Game): Promise<void> {
  await game.p1.play("bryn", { to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bryn", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("bryn")).toBe("base");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** P1 casts PF and passes → P2 holds priority with PF on the chain. */
async function castPfToP2Priority(game: Game): Promise<void> {
  const energy = game.p1.energy();
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: energy - 5, power: { mind: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["pf"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** From PF on the chain: resolve it, P1 banishes u1, P2 banishes u2. Leaves whatever comes next pending. */
async function resolvePfAndBanish(game: Game): Promise<void> {
  await until(game, isPickFor(P1, /banish/i));
  await game.p1.pick("u1");
  await until(game, isPickFor(P2, /banish/i));
  await game.p2.pick("u2");
}

describe("Brynhir Thundersong × Promising Future — the opponent's instructed play is forbidden", () => {
  // ── (a) P2's action set ─────────────────────────────────────────────────────────────────────────
  test("(a) control: BEFORE Brynhir's trigger resolves (P2's priority on that very trigger) P2 could still cast Discipline and flip its facedown card", async () => {
    const game = await board().build();
    await game.p1.play("bryn", { to: "base" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc2")).toBe(true);
    expect(game.p2.can("reveal", "hidden2")).toBe(true);
    expect(playKeys(game).sort()).toEqual(["playSpell:disc2", "revealHidden:hidden2"]);
  });

  test("(a) after the trigger resolved, P2 holding priority on the PF chain has NO 'play a card' option: no hand Reaction, no facedown flip (419.1, 811.1.c.3) — both rejected", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    expect(playKeys(game)).toEqual([]);
    expect(game.p2.can("cast", "disc2")).toBe(false);
    expect(game.p2.can("reveal", "hidden2")).toBe(false);
    await expect(game.p2.cast("disc2", { targets: "p2holder" })).rejects.toThrow();
    await expect(game.p2.reveal("hidden2")).rejects.toThrow();
    expect(game.zoneOf("disc2")).toBe("hand");
    expect(game.zoneOf("hidden2")).toBe("facedown-bfP2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["pf"]);
  });

  test("(a) …but rune abilities and the gear already on board still work: P2 taps its rune (+1 energy) and exhausts Seal of Focus (+[calm]) in that same window", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    expect(game.p2.can("tapRune", "r2")).toBe(true);
    expect(game.p2.can("recycleRune", "r2")).toBe(true);
    expect(game.p2.can("activate", "seal")).toBe(true);
    await game.p2.tapRune("r2");
    await game.p2.activate("seal");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    expect(game.state("seal").isExhausted).toBe(true);
    // Even with 3 energy + 2 calm floating, Discipline is still not castable — it's the prohibition, not the cost.
    expect(game.p2.can("cast", "disc2")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // ── (b) look / banish / recycle still happen ────────────────────────────────────────────────────
  test("(b) on resolution P2 still LOOKS at exactly its top 5 and must banish one (compulsory pick, no decline) — looking/banishing are not 'playing cards'", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await until(game, isPickFor(P1, /banish/i));
    await game.p1.pick("u1");
    const d = (await until(game, isPickFor(P2, /banish/i))) as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, max: 1, seat: P2 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["b2", "b3", "b4", "b5", "u2"]);
    await game.p2.pick("u2");
    expect(game.zoneOf("u2")).toBe("banishment");
  });

  test("(b) …and recycles the other 4 to the bottom of P2's OWN deck (416.1.c): deck 10 → 5 looked → +4 under b6 = 9; P1's deck likewise 9", async () => {
    const game = await board().build();
    expect(game.p2.deck()).toHaveLength(10);
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    const p2deck = game.p2.deck();
    expect(p2deck).toHaveLength(9);
    expect(p2deck[0]).toBe("b6");
    expect(p2deck.slice(-4).sort()).toEqual(["b2", "b3", "b4", "b5"]);
    expect(game.p1.deck()).toHaveLength(9);
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a2", "a3", "a4", "a5"]);
  });

  // ── (c) U2 is not played ────────────────────────────────────────────────────────────────────────
  test("(c) U2 is never put on the chain: right after both banishes the only pending play is P1's U1 — P2 is never asked where to put U2 (054.1, 358.3.a, 359.3.e.6)", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([["u1", P1]]);
    let p2Asked = false;
    await until(game, (d) => {
      p2Asked ||= d?.seat === P2 && d?.kind !== "action";
      return isPickFor(P1, /destination/i)(d);
    });
    expect(p2Asked).toBe(false);
    expect(game.zoneOf("u2")).toBe("banishment");
  });

  test("(c) end state for U2: still in P2's BANISHMENT — not trash, not deck, not hand, not board; P2 has played 0 cards this turn", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.zoneOf("u2")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["u2"]);
    expect(game.p2.trash()).not.toContain("u2");
    expect(game.p2.deck()).not.toContain("u2");
    expect(game.p2.hand()).not.toContain("u2");
    expect(game.p2.units()).not.toContain("u2");
    expect(game.p2.units().sort()).toEqual(["p2holder"]); // P2 board unchanged
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
  });

  // ── (d) U1 is played ────────────────────────────────────────────────────────────────────────────
  test("(d) Brynhir binds opponents only: U1 becomes P1's pending item, P1 picks base, it enters exhausted for 0 energy; P1 board = Brynhir + U1; PF in trash; chain empty; P1 played 3 cards", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    expect(game.zoneOf("pf")).toBe("trash"); // PF finished resolving before the pending play is finalized
    const d = (await until(game, isPickFor(P1, /destination/i))) as Pick;
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP1"]);
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.p1.base().sort()).toEqual(["bryn", "u1"]);
    expect(game.state("u1")).toMatchObject({ controller: P1, isExhausted: true, might: 4, zone: "base" });
    expect(game.p1.energy()).toBe(0); // Energy ignored; no Power cost on a vanilla unit
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3); // Brynhir, PF, U1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) the prohibition lasts the turn: in a later window (P1's open main phase → P1 ends turn) P2 still couldn't play; on P2's own turn Discipline is castable again", async () => {
    const game = await board().build();
    await brynhirResolved(game);
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.gameState.cannotPlayCardsThisTurn).toEqual({ [P2]: true });
    expect(game.p2.can("cast", "disc2")).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.cannotPlayCardsThisTurn).toBeUndefined();
    await game.p2.do("addResources", { energy: 2, power: { calm: 1 } }); // pools were emptied at end of turn
    expect(game.p2.can("cast", "disc2")).toBe(true);
  });

  // ── (e) contrasts ───────────────────────────────────────────────────────────────────────────────
  test("(e) NO Brynhir first: both plays are queued next-player-first — [U2 (P2), U1 (P1)] — P2 places U2, then P1 places U1; both enter their owners' bases", async () => {
    const game = await board().build();
    await castPfToP2Priority(game);
    // Without the prohibition P2 could of course still respond with Discipline / the flip here.
    expect(playKeys(game).sort()).toEqual(["playSpell:disc2", "revealHidden:hidden2"]);
    await resolvePfAndBanish(game);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["u2", P2],
      ["u1", P1],
    ]);
    const d2 = (await until(game, isPickFor(P2, /destination/i))) as Pick;
    expect(d2.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP2"]);
    await game.p2.pick("base");
    expect(game.zoneOf("u2")).toBe("base");
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.state("u2")).toMatchObject({ controller: P2, isExhausted: true, owner: P2, zone: "base" });
    expect(game.state("u1")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
  });

  test("(e) Brynhir is the card P1 banishes off PF: U2 (next player) is finalized and on the board BEFORE Brynhir is even played, so her trigger cannot stop it — U2 enters, then Brynhir enters and locks P2 out for the rest of the turn", async () => {
    const game = await board(BRYNHIR).build(); // "u1" alias now names the Brynhir on top of P1's deck
    expect(game.state("u1").name).toBe("Brynhir Thundersong");
    await castPfToP2Priority(game);
    await resolvePfAndBanish(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["u2", "u1"]);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    expect(game.zoneOf("u2")).toBe("base"); // already in play …
    expect(game.gameState.cannotPlayCardsThisTurn).toBeUndefined(); // … with no prohibition in sight
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.p1.energy()).toBe(6); // Brynhir's 6 Energy ignored (11 − 5 for PF)
    // Her play trigger is now on the chain; let it resolve.
    await until(game, isOpenMain);
    expect(game.gameState.cannotPlayCardsThisTurn).toEqual({ [P2]: true });
    expect(game.zoneOf("u2")).toBe("base"); // Brynhir does not undo a card already played
    expect(game.state("u2")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.banishment()).toEqual([]);
    // From here on P2 is locked out for the turn.
    expect(game.p2.can("cast", "disc2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
