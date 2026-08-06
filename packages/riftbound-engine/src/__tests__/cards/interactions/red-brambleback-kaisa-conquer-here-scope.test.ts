/**
 * Interaction: Red Brambleback (unl-029-219)
 *     "Your conquer effects for conquering here trigger an additional time.
 *      When I conquer, [Buff] a friendly unit."
 *   × Kai'Sa, Survivor (ogn-039-298) "When I conquer, draw 1."
 *   × Zaun Warrens (ogn-298-298, battlefield) "When you conquer here, discard 1, then draw 1."
 *
 * Question: Brambleback + Kai'Sa conquer Zaun Warrens together — how many times do Kai'Sa's draw,
 * Brambleback's Buff and Zaun Warrens' effect trigger, and does the doubling score extra points?
 * Contrast: Brambleback sits at battlefield X while Kai'Sa alone conquers battlefield Y.
 *
 * Rules:
 *   383.4.c / 383.4.c.2.a — "When I conquer" is a Conquer Effect of a unit PRESENT at the conquer.
 *   383.4.c.2.b — "When you conquer here" (Zaun Warrens) is a Conquer Effect referencing the player.
 *   Brambleback's replacement: each of YOUR conquer effects for conquering HERE triggers one extra
 *   time → Kai'Sa ×2, Brambleback ×2, Zaun Warrens ×2, all separate chain items (383.3.d).
 *   471.1 / 471.2.a / 471.2.c — the Score itself happens once: exactly 1 point.
 *   469.1 — conquer = gaining control of a battlefield not yet scored this turn.
 *   Scope: "conquering here" = Brambleback's own battlefield; elsewhere (or from base) nothing doubles.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RED_BRAMBLEBACK = "unl-029-219";
const KAISA = "ogn-039-298";
const ZAUN_WARRENS = "ogn-298-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla hand fodder for Zaun Warrens' discard

/**
 * Case YES: Zaun Warrens (P1's battlefield card, currently held by P2, abilities live) is empty;
 * Brambleback + Kai'Sa wait in P1's base; P1 holds three vanilla cards to discard from.
 */
function yesBoard() {
  return scenario()
    .battlefield("warrens", { controller: P2, def: ZAUN_WARRENS, inert: false, owner: P1 })
    .unit(P1, "base", RED_BRAMBLEBACK, "bramble")
    .unit(P1, "base", KAISA, "kaisa")
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .hand(P1, FILLER, "h3");
}

/** Move attackers in, both players pass focus → the empty battlefield is conquered and triggers go pending. */
async function conquerWith(game: Game, units: string[], bf: string): Promise<void> {
  await game.p1.move(units, bf);
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields[bf]?.controller).toBe(P1);
}

function chainCount(game: Game, cardId: string): number {
  return game.chain().filter((i) => i.cardId === cardId && i.triggered).length;
}

/** Resolve everything, answering P1's prompts: discard the named cards in order, Buff the named units in order. */
async function resolveAll(game: Game, discards: string[], buffs: string[]): Promise<void> {
  const d = [...discards];
  const b = [...buffs];
  for (let i = 0; i < 20; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered" || !r.decision || r.decision.kind !== "pick") {
      return;
    }
    const isBuff = /Red Brambleback/.test(r.decision.prompt);
    const answer = isBuff ? b.shift() : d.shift();
    if (!answer) {
      throw new Error(`unexpected extra prompt: ${r.decision.prompt}`);
    }
    await game.seat(r.decision.seat).pick(answer);
  }
}

describe("Red Brambleback × Kai'Sa × Zaun Warrens — 'conquering here' doubling scope", () => {
  test("Case YES baseline: conquering the Warrens together puts Kai'Sa, Brambleback AND Zaun Warrens conquer effects on the chain, all controlled by P1", async () => {
    const game = await yesBoard().build();
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    expect(chainCount(game, "kaisa")).toBeGreaterThanOrEqual(1);
    expect(chainCount(game, "bramble")).toBeGreaterThanOrEqual(1);
    expect(chainCount(game, "warrens")).toBeGreaterThanOrEqual(1); // 383.4.c.2.b: battlefield "you conquer here" is a conquer effect
    for (const item of game.chain()) {
      expect(item.controller).toBe(P1);
      expect(item.triggered).toBe(true);
    }
  });

  test.failing("BUG: Case YES — Kai'Sa's 'When I conquer, draw 1' triggers an additional time here (2 chain items)", async () => {
    // Expected: Brambleback's static makes each of P1's conquer effects for conquering its battlefield
    // trigger twice → two separate Kai'Sa items. Actual: the "additional time" static is not
    // implemented; Kai'Sa triggers once.
    const game = await yesBoard().build();
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    expect(chainCount(game, "kaisa")).toBe(2);
  });

  test.failing("BUG: Case YES — Brambleback's own 'When I conquer, Buff a friendly unit' also triggers twice (2 chain items)", async () => {
    // Expected: 2 Brambleback items (its own conquer effect is one of "your conquer effects here").
    // Actual: 1.
    const game = await yesBoard().build();
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    expect(chainCount(game, "bramble")).toBe(2);
  });

  test.failing("BUG: Case YES — Zaun Warrens' 'When you conquer here' is a conquer effect of the conquering player (383.4.c.2.b) and triggers twice", async () => {
    // Expected: 2 Zaun Warrens items. Actual: 1.
    const game = await yesBoard().build();
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    expect(chainCount(game, "warrens")).toBe(2);
  });

  test("Case YES — points: the doubling applies to conquer EFFECTS, not the Score; P1 gains exactly 1 point (471.1 / 471.2.c)", async () => {
    const game = await yesBoard().build();
    expect(game.p1.points()).toBe(0);
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    expect(game.p1.points()).toBe(1);
    await resolveAll(game, ["h1", "h2"], ["kaisa", "bramble"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test.failing("BUG: Case YES fully resolved — Kai'Sa draws 2, Warrens discards+draws twice, both Buff items land (Kai'Sa and Brambleback each buffed)", async () => {
    // Expected end state: hand 3 → +2 (Kai'Sa ×2) +0 (Warrens: −1+1, twice) = 5; trash holds h1,h2;
    // deck −4; two Buff resolutions targeting kaisa then bramble → both buffed.
    // Actual: every effect fires once → hand 4, one discard, one Buff.
    const game = await yesBoard().build();
    const deck0 = game.p1.deck().length;
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    await resolveAll(game, ["h1", "h2"], ["kaisa", "bramble"]);
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["h1", "h2"]));
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.p1.deck()).toHaveLength(deck0 - 4);
    expect(game.state("kaisa").isBuffed).toBe(true);
    expect(game.state("bramble").isBuffed).toBe(true);
    expect(game.state("kaisa").might).toBe(5);
    expect(game.state("bramble").might).toBe(5);
  });

  test("Case YES today (single triggers) still resolves cleanly: Kai'Sa +1 card, Warrens discard h1 → draw, one Buff on Kai'Sa", async () => {
    // Pins the currently-implemented single-trigger path so regressions there are visible
    // independently of the doubling BUGs above. Every assertion here is also true under the rules
    // as a lower bound (≥1 draw, h1 discarded, Kai'Sa buffed).
    const game = await yesBoard().build();
    await conquerWith(game, ["bramble", "kaisa"], "warrens");
    await resolveAll(game, ["h1", "h2"], ["kaisa", "bramble"]);
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.trash()).toContain("h1");
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(4);
    expect(game.state("kaisa").isBuffed).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Case NO: Brambleback at battlefield X, Kai'Sa alone conquers battlefield Y → exactly ONE Kai'Sa draw", async () => {
    const game = await scenario()
      .battlefield("bfX", { controller: P1 })
      .battlefield("bfY", { controller: P2 })
      .unit(P1, "bfX", RED_BRAMBLEBACK, "bramble")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await conquerWith(game, ["kaisa"], "bfY");
    expect(chainCount(game, "kaisa")).toBe(1);
    await resolveAll(game, [], ["kaisa", "kaisa"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("Case NO — Brambleback did not conquer (it sits at X), so its own 'When I conquer' Buff must NOT trigger (383.4.c.2.a)", async () => {
    // Only Kai'Sa's item on the chain; no Buff prompt; nobody buffed.
    const game = await scenario()
      .battlefield("bfX", { controller: P1 })
      .battlefield("bfY", { controller: P2 })
      .unit(P1, "bfX", RED_BRAMBLEBACK, "bramble")
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    await conquerWith(game, ["kaisa"], "bfY");
    expect(chainCount(game, "bramble")).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("kaisa").isBuffed).toBe(false);
    expect(game.state("bramble").isBuffed).toBe(false);
  });

  test("Case NO': Brambleback in BASE while Kai'Sa conquers the Warrens → nothing doubles: one Kai'Sa draw, one Warrens discard/draw", async () => {
    const game = await yesBoard().build();
    const deck0 = game.p1.deck().length;
    await conquerWith(game, ["kaisa"], "warrens");
    expect(chainCount(game, "kaisa")).toBe(1);
    expect(chainCount(game, "warrens")).toBe(1);
    await resolveAll(game, ["h1", "h2"], ["kaisa", "kaisa"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toContain("h1");
    expect(game.p1.trash()).not.toContain("h2");
    // 3 in hand → Kai'Sa +1 → Warrens −1 +1 → 4 ; deck −2
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
  });
});
