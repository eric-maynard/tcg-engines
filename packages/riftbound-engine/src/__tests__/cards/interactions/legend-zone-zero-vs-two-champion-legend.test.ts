/**
 * Interaction: two adversarial Legend-Zone shapes — a deck with ZERO Champion Legends and a deck
 * with TWO — driven through deck validation and then through an ability that names "a legend".
 *
 *   Relentless Storm (ogn-249-298) Legend · Volibear · [fury]/[body]
 *     "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted."
 *   Loose Cannon     (ogn-251-298) Legend · Jinx · [fury]/[chaos]
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *   Royal Entourage  (sfd-039-221) Unit · 3 [calm] · 4 [Might]
 *     "When you play me, ready or exhaust a legend."
 *
 * Rules: 103 / 103.1 (a deck has EXACTLY one Champion Legend) · 103.1.b / 103.1.b.2 (Domain
 * Identity comes from the Champion Legend and constrains the main and rune decks) · 107.4.a
 * (the Legend Zone) · 107.4.d / 107.4.d.1 / 107.4.d.2 (the Champion Legend cannot be removed; any
 * OTHER legend there is a non-Champion legend and can be) · 315.1.b (Awaken readies every game
 * object the turn player controls that can be readied) · 358.3.a (an impossible instruction is
 * SKIPPED on resolution — it does not stop the card being played or finalized) · 355.8 (modes
 * with no legal object are not offered).
 *
 * Q: does deck validation refuse before the game with a named error, or does the app start the
 *    game? With zero legends — what is the deck's Domain Identity, does Awaken hang looking for a
 *    legend to ready, and does Royal Entourage prompt with an empty choice list or resolve as a
 *    skipped instruction? With two legends — which one is the Champion Legend, does Awaken ready
 *    both, do both legends' triggers fire, and does Royal Entourage offer a two-option choice?
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { type DeckListIds, validateDeckConfig } from "../../../../../../apps/riftbound-app/server/deck-rules";

const ROYAL_ENTOURAGE = "sfd-039-221";
const RELENTLESS_STORM = "ogn-249-298";
const LOOSE_CANNON = "ogn-251-298";
const TRINITY_FORCE = "sfd-115-221"; // a [body] card — outside a fury/chaos identity

/** The stock Jinx (fury/chaos) starter: Loose Cannon in the legend slot, a legal 40-card main deck. */
const baseDeck = (): DeckListIds => buildDefaultDeck("fury", "chaos") as unknown as DeckListIds;

describe("Legend Zone with zero and with two legends", () => {
  // ---------------------------------------------------------------- deck legality (before a game)

  test("the stock deck is legal, and dropping its legend is refused with a coded NO_LEGEND error citing 103.1 — never a thrown exception", () => {
    expect(validateDeckConfig(baseDeck())).toMatchObject({ legal: true, problems: [] });

    const zero = validateDeckConfig({ ...baseDeck(), legendId: null });
    expect(zero.legal).toBe(false);
    const noLegend = zero.problems.find((p) => p.code === "NO_LEGEND");
    expect(noLegend).toBeDefined();
    expect(noLegend?.severity).toBe("error");
    expect(noLegend?.message).toMatch(/103\.1/);
    // Domain Identity is undefined without a legend, so the domain checks degrade to
    // "unconstrained" instead of blowing up — no domain problem is reported at all.
    expect(zero.problems.map((p) => p.code)).not.toContain("DOMAIN_IDENTITY_VIOLATION");
  });

  // 103.1 is enforced by the deck MODEL, not only by a check: a `DeckListIds` carries exactly one
  // `legendId` slot, so a "second Champion Legend" can only be smuggled in as a main-deck member —
  // where it is refused by name and card type. There is therefore no separate MORE_THAN_ONE_LEGEND
  // code, and no deck can reach the table with two Champion Legends.
  test("a second legend can only appear in the main deck, where it is refused by name (103.1)", () => {
    const base = baseDeck();
    const two = validateDeckConfig({
      ...base,
      mainDeckCardIds: [...base.mainDeckCardIds.slice(0, -1), RELENTLESS_STORM],
    });
    expect(two.legal).toBe(false);
    const problem = two.problems.find((p) => p.code === "MAIN_DECK_WRONG_TYPE");
    expect(problem?.severity).toBe("error");
    expect(problem?.message).toMatch(/Relentless Storm is a legend and cannot be in the main deck/);
  });

  test("Domain Identity is read from the Champion Legend slot ALONE (103.1.b.2): under Loose Cannon [fury]/[chaos] a [body] card is illegal", () => {
    const base = baseDeck();
    const withBody = validateDeckConfig({
      ...base,
      legendId: LOOSE_CANNON,
      mainDeckCardIds: [...base.mainDeckCardIds.slice(0, -1), TRINITY_FORCE],
    });
    expect(withBody.legal).toBe(false);
    expect(withBody.problems.find((p) => p.code === "DOMAIN_IDENTITY_VIOLATION")?.message).toMatch(
      /\[body\].*\[fury, chaos\]/,
    );
  });

  // ---------------------------------------------------------------- ZERO legends, in game

  test("ZERO legends: the Legend Zone is empty (107.4.a) and Awaken does not hang — turns advance normally (315.1.b)", async () => {
    const game = await scenario().build();
    expect(game.p1.legend()).toBeUndefined();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // BUG — rules 355.8 + 358.3.a: with an empty Legend Zone NEITHER mode of "ready or exhaust a
  // legend" has a legal object, so no mode may be offered and the instruction is simply skipped on
  // resolution. Actual: the engine raises a "Choose a mode" modal listing both modes ("Ready a
  // legend" / "Exhaust a legend") even though each has zero candidates, and the game BLOCKS there —
  // `settle()` cannot drain it and `advanceTurn()` throws "cannot end turn while Choose a mode is
  // pending".
  test.failing("ZERO legends BUG: Royal Entourage's 'ready or exhaust a legend' must be skipped, not opened as an empty modal (355.8, 358.3.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .hand(P1, ROYAL_ENTOURAGE, "royal")
      .build();
    await game.p1.play("royal");
    expect(game.decision()?.prompt).not.toMatch(/Choose a mode/);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("royal")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---------------------------------------------------------------- TWO legends, in game

  /** P1's turn with BOTH legends in the Legend Zone, a 5-Might Brute and a Royal Entourage in hand. */
  function twoLegends() {
    return scenario()
      .legend(P1, RELENTLESS_STORM, "storm")
      .legend(P1, LOOSE_CANNON, "cannon")
      .resources(P1, { energy: 10, power: { calm: 2, fury: 2 } })
      .hand(P1, { cardType: "unit", might: 5, name: "Brute" }, "brute")
      .hand(P1, ROYAL_ENTOURAGE, "royal");
  }

  /** Play the Brute (Storm's trigger exhausts it) and Royal Entourage exhausting the Cannon. */
  async function bothExhausted(): Promise<Game> {
    const game = await twoLegends().build();
    await game.p1.play("brute");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes(); // "exhaust me to channel 1 rune exhausted"
    await game.settle();
    await game.p1.play("royal");
    await game.p1.chooseMode(1); // "Exhaust a legend"
    await game.p1.pick("cannon");
    await game.settle();
    return game;
  }

  test("TWO legends: both sit in the Legend Zone; a non-Champion legend is an ordinary controlled game object (107.4.a, 107.4.d.1)", async () => {
    const game = await twoLegends().build();
    expect(game.zoneOf("storm")).toBe("legendZone");
    expect(game.zoneOf("cannon")).toBe("legendZone");
    expect(game.state("storm").controller).toBe(P1);
    expect(game.state("cannon").controller).toBe(P1);
  });

  test("TWO legends: Royal Entourage presents a REAL two-option choice — both modes, then both legends (355.3, 355.8)", async () => {
    const game = await twoLegends().build();
    await game.p1.play("royal");
    const mode = game.decision() as { kind: string; seat: string; options: readonly { label?: string }[] };
    expect(mode).toMatchObject({ kind: "pick", seat: P1 });
    expect(mode.options.map((o) => o.label)).toEqual(["Ready a legend", "Exhaust a legend"]);
    await game.p1.chooseMode(1);
    const target = game.decision() as { options: readonly { card?: string; key: string }[] };
    expect(target.options.map((o) => o.card ?? o.key)).toEqual(["storm", "cannon"]);
    await game.p1.pick("cannon");
    await game.settle();
    expect(game.state("cannon").isExhausted).toBe(true);
    expect(game.state("storm").isExhausted).toBe(false);
  });

  test("TWO legends: BOTH legends' abilities are live — Storm's play trigger channels a rune, and it is the one exhausted by its own cost", async () => {
    const game = await twoLegends().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("brute");
    await game.p1.yes();
    await game.settle();
    expect(game.state("storm").isExhausted).toBe(true); // the base cost of its own trigger
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(runesBefore); // channelled EXHAUSTED
  });

  test("TWO legends: Awaken readies BOTH of them (315.1.b), and Loose Cannon's Beginning-Phase trigger fires alongside", async () => {
    const game = await bothExhausted();
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.state("cannon").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual([]); // ≤ 1 card: Loose Cannon's condition will hold

    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's Awaken + Beginning Phase

    expect(game.state("storm").isExhausted).toBe(false);
    expect(game.state("cannon").isExhausted).toBe(false);
    // the turn draw (1) plus Loose Cannon's conditional draw (1) — the non-Champion status of the
    // other legend changes nothing about either ability being live.
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
