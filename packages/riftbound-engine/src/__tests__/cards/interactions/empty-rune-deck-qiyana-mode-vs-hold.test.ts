/**
 * Interaction: a rune deck drained to zero — what still gets OFFERED, and what silently does nothing.
 *
 *   Qiyana, Victorious (ogn-155-298) Unit · Body · [4]+[body] · 4 Might
 *     "[Deflect] · When I conquer, draw 1 or channel 1 rune exhausted."
 *   Startipped Peak    (ogn-288-298) Battlefield —
 *     "When you hold here, you may channel 1 rune exhausted."
 *   Calm Rune          (ogn-042-298) Rune · Calm (basic)
 *
 * Q: All 12 runes are channeled and the Rune Deck is empty. (a) Is Qiyana's channel MODE still
 *    offerable, or is the impossible mode pruned so the choice auto-resolves to "draw 1"?
 *    (b) Does the Peak's single optional instruction prompt at all? And the load-bearing asymmetry:
 *    draining the MAIN deck triggers Burn Out — does draining the RUNE deck trigger anything
 *    analogous? (c) If a Calm Rune is recycled back mid-game, does the next Channel Phase resume at 1?
 *
 * A: (a) Yes — 430.3 makes channeling ZERO a legal, defined outcome, not an illegal choice, so both
 *    modes must be presented and picking "channel" channels 0 and does nothing. Pruning the mode (or
 *    calling it illegal under 355.16, which only forbids choices that deterministically produce
 *    ILLEGAL later actions) would rewrite the player's decision. (b) The Peak's "you may" fires, the
 *    player is offered the option, and yes channels 0 per 430.3 — a resolved trigger, not an error.
 *    There is NO rune-deck Burn Out: 431 is defined only for the Main Deck (315.4.b.1 → 431, whose
 *    431.2.d recycles the trash into the Main Deck and hands an opponent a point), while 315.3.b.1
 *    simply says the turn player channels as many as possible. An empty Rune Deck therefore channels
 *    0 every turn forever: no point award, no loss condition, no recycle. (c) Runes recycle to the
 *    RUNE deck, never the Main Deck (161.2.b / 178.1.a.2), so one recycled Calm Rune restores the deck
 *    to 1 and the next Channel Phase channels exactly 1 (430.3 again), then returns to 0. That Calm
 *    Rune is off-identity for a Body Qiyana list, which the deck validator flags under 103.3.a.1.
 *
 * Rules: 103.3.a.1 · 161.2.b · 178.1.a.2 · 315.3.b.1 · 315.4.b.1 · 355.16 · 430.1 · 430.3 · 431 ·
 * 431.2.d.
 */
import { describe, expect, test } from "bun:test";
import type { Domain } from "@tcg/riftbound-types";
import {
  type BattlefieldCard,
  type Card,
  type LegendCard,
  type RuneCard,
  type UnitCard,
  createCardId,
} from "@tcg/riftbound-types/cards";
import { type DeckConfig, validateDeck } from "../../../validators/deck-validators";
import type { Game } from "../../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const STARTIPPED_PEAK = "ogn-288-298";
const CALM_RUNE = "ogn-042-298";
const BODY_RUNE = "ogn-126-298";

/** P1's turn, empty rune deck, Qiyana about to conquer P2's bf1 off a lone 1-Might picket. */
function qiyanaBoard() {
  return scenario()
    .active(P1)
    .fillDecks({ main: 10, runes: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Picket" }, "picket")
    .unit(P1, "base", QIYANA, "qiyana");
}

/** Attack and close the showdown: Qiyana conquers, and her modal trigger asks. */
async function intoConquerChoice(): Promise<Game> {
  const game = await qiyanaBoard().build();
  await game.p1.move("qiyana", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

/** P2's turn ending into P1's, with P1 holding Startipped Peak and `runes` cards left to channel. */
function peakBoard(runeDeck: readonly string[]) {
  return scenario()
    .turn(2)
    .active(P2)
    .fillDecks({ main: 10, runes: 0 })
    .runeDeck(P1, runeDeck)
    .battlefield("bf1", { controller: P1, def: STARTIPPED_PEAK, inert: false })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
}

describe("Empty rune deck — Qiyana's mode, Startipped Peak's 'you may', and the missing Burn Out", () => {
  // ── (a) the impossible mode is still a mode ──────────────────────────────────────────────────

  test("(a) with an EMPTY rune deck Qiyana's conquer trigger still offers BOTH modes — the channel option is not pruned and the choice does not auto-resolve to 'draw 1'", async () => {
    const game = await intoConquerChoice();
    expect(game.p1.runeDeck()).toEqual([]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, min: 1, max: 1 });
    // Both printed bullets are selectable, with their printed labels (355.3-style mode choice).
    // NOTE: annotating the dead mode ("rune deck empty — channels 0") is an app-surface nicety;
    // the engine's contract is only that the mode remains OFFERED.
    expect((d as unknown as { options: { key: string; label: string }[] }).options).toEqual([
      expect.objectContaining({ key: "0", label: "Draw 1" }),
      expect.objectContaining({ key: "1", label: "Channel 1 rune exhausted" }),
    ]);
  });

  test("(a) picking the channel mode is legal and simply does nothing — 430.3 channels as many as possible, i.e. zero (no draw is substituted, no error)", async () => {
    const game = await intoConquerChoice();
    const hand = game.p1.hand().length;
    await game.p1.pick("1");
    await game.settle();
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand); // NOT silently converted into "draw 1"
    expect(game.p1.points()).toBe(1); // the conquer itself still scored
    expect(game.violations()).toEqual([]);
  });

  test("(a) the other mode still works on the same empty board — 'draw 1' draws exactly one", async () => {
    const game = await intoConquerChoice();
    const hand = game.p1.hand().length;
    await game.p1.pick("0");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toEqual([]);
  });

  // ── (b) the optional hold trigger, and the asymmetry with Burn Out ───────────────────────────

  test("(b) Startipped Peak's 'you may' fires even with an empty rune deck: the yes/no is offered and accepting is a resolved trigger that channels 0", async () => {
    const game = await peakBoard([]).build();
    await game.advanceTurn(); // P2 ends → P1's turn, the Hold fires the Peak
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.points()).toBe(1); // the Hold scored; the null channel changed nothing
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — with runes left, the Peak's channel is real and enters EXHAUSTED on top of the Channel Phase's 2 ready runes", async () => {
    const game = await peakBoard([CALM_RUNE, CALM_RUNE, CALM_RUNE]).build();
    await game.advanceTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // the Peak's is exhausted
    expect(game.p1.runeDeck()).toEqual([]);

    const declined = await peakBoard([CALM_RUNE, CALM_RUNE, CALM_RUNE]).build();
    await declined.advanceTurn();
    await declined.p1.no();
    await declined.settle();
    expect(declined.p1.runes()).toHaveLength(2); // the Channel Phase's two, nothing more
    expect(declined.p1.runeDeck()).toHaveLength(1);
  });

  test("(b) an empty RUNE deck has no Burn Out: turn after turn the Channel Phase channels 0 — no point for anybody, no recycle, no loss (315.3.b.1)", async () => {
    const game = await scenario().turn(2).active(P2).fillDecks({ main: 10, runes: 0 }).build();
    const trash = game.p1.trash().length;
    await game.advanceTurn(); // P1's Channel Phase
    await game.advanceTurn();
    await game.advanceTurn(); // …and P1's next one
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.trash()).toHaveLength(trash); // nothing was recycled into anything
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("(b) the asymmetry: an empty MAIN deck DOES burn out on the Draw Step — the trash is recycled into the Main Deck and an opponent gains a point (315.4.b.1 → 431 / 431.2.d)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 0, runes: 12 })
      .trash(P1, { cardType: "unit", might: 1, name: "Corpse" }, "corpse")
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.advanceTurn(); // P1's Draw Step with an empty Main Deck
    expect(game.p2.points()).toBe(1); // 431.2.d — an opponent gains a point
    expect(game.p1.hand()).toHaveLength(1); // the draw completes out of the recycled trash
    expect(game.p1.trash()).toEqual([]);
    expect(game.isOver()).toBe(false); // burning out is not a loss condition
  });

  // ── (c) refilling the rune deck ──────────────────────────────────────────────────────────────

  test("(c) a recycled rune goes to the RUNE deck, never the Main Deck (161.2.b / 178.1.a.2), and the next Channel Phase channels exactly 1 before returning to 0", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .fillDecks({ main: 10, runes: 0 })
      .rune(P1, "calm", { alias: "r1" })
      .build();
    const mainDeck = game.p1.deck().length;
    await game.p1.recycleRune("r1");
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toEqual(["r1"]);
    expect(game.p1.deck()).toHaveLength(mainDeck); // the Main Deck never sees a rune
    expect(game.p1.power("calm")).toBe(1); // recycling paid its power

    await game.advanceTurn();
    await game.advanceTurn(); // back to P1: its Channel Phase channels "as many as possible" = 1
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runeDeck()).toEqual([]);

    await game.advanceTurn();
    await game.advanceTurn(); // the turn after that channels 0 again
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runeDeck()).toEqual([]);
  });

  // ── (c) the deck-construction side of the same Calm Rune ─────────────────────────────────────

  test("(c) 103.3.a.1 — a Calm Rune in a Body Qiyana list is off-identity and is reported by the deck validator; the same list with Body Runes is clean", async () => {
    const pool = await loadDefaultCardPool();
    const qiyana = pool.get(QIYANA) as unknown as UnitCard;
    const calm = pool.get(CALM_RUNE) as unknown as RuneCard;
    const body = pool.get(BODY_RUNE) as unknown as RuneCard;
    const peak = pool.get(STARTIPPED_PEAK) as unknown as BattlefieldCard;
    const legend: LegendCard = {
      cardType: "legend",
      championTag: "Qiyana",
      domain: ["body"] as Domain[],
      id: createCardId("erd-legend"),
      name: "Qiyana Legend",
    };
    const filler = (i: number): UnitCard => ({
      cardType: "unit",
      domain: "body" as Domain,
      id: createCardId(`erd-filler-${i}`),
      might: 2,
      name: `Filler ${Math.floor(i / 3) + 1}`,
    });
    const battlefields: BattlefieldCard[] = [
      peak,
      { ...peak, id: createCardId("erd-bf2"), name: "Second Field" },
      { ...peak, id: createCardId("erd-bf3"), name: "Third Field" },
    ];
    const mainDeck: Card[] = [qiyana, ...Array.from({ length: 39 }, (_, i) => filler(i))];
    const config = (rune: RuneCard): DeckConfig => ({
      battlefields,
      chosenChampion: qiyana,
      legend,
      mainDeck,
      mode: "duel",
      runeDeck: Array.from({ length: 12 }, () => rune),
    });
    expect(validateDeck(config(calm)).errors.map((e) => e.code)).toContain("RUNE_DOMAIN_VIOLATION");
    expect(validateDeck(config(body)).errors).toEqual([]);
  });
});
