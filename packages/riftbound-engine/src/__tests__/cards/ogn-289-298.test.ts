/**
 * Targon's Peak — ogn-289-298 · Battlefield
 *
 *   When you conquer here, ready up to 2 runes at the end of this turn.
 *
 * Rules: 383.4.c / 471.2.a (conquer effects trigger at the conquered battlefield), 355.5.b (this very
 * card: the ready is a DELAYED trigger — nothing is chosen when the conquer effect is finalized, the
 * "up to 2 runes" are chosen when the delayed trigger is finalized at the end of the turn), 317.1
 * (Ending Step: "at the end of the turn" effects), 392 (a delayed ability executes regardless of what
 * happened to its source since), 355.13 ("up to N" = 0..N, chooser's call), 315.1.b (Awaken readies
 * only the TURN player's objects — so runes readied at the end of my turn stay ready through yours),
 * 469.1 vs 469.2 (conquer ≠ hold).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. NOTHING happens at conquer time: no prompt, no rune readies mid-turn (that would be free energy).
 *     The payoff is two ready runes during the OPPONENT's turn (Reaction mana).
 *  2. Because the choice is made at end of turn, runes tapped AFTER the conquer are eligible.
 *  3. "up to 2": three exhausted → exactly two; one exhausted → that one; the player may take zero.
 *  4. Runes only — the exhausted conqueror is not a rune.
 *  5. Negative space: holding the Peak, or conquering some other battlefield, schedules nothing.
 *  6. "You" = the conquering player: P2 taking the Peak readies P2's runes at the end of P2's turn.
 *  7. 392: losing the Peak (conqueror dies) later that turn does not cancel the scheduled ready.
 */

import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-289-298";

/** Inline 1-energy slow spell: deal 4 to a unit (used to kill my own conqueror). */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
};

/** P1's turn; the Peak is empty and uncontrolled; P1 has a ready 3-Might raider and `exhausted`+`ready` fury runes. */
function board(exhausted = 3, ready = 0) {
  return scenario()
    .battlefield("peak", { controller: null, def: CARD, inert: false })
    .battlefield("plain", { controller: null })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .runes(P1, "fury", exhausted, { exhausted: true })
    .runes(P1, "fury", ready)
    .runes(P2, "calm", 2, { exhausted: true });
}

/** Walk `unit` onto an empty battlefield and settle into the open main phase (conquer scored). */
async function conquer(game: Game, seat: Seat, unit: string, bf: string): Promise<void> {
  await game.seat(seat).move(unit, bf);
  await game.settle(); // the Cleanup-begun non-combat showdown is handed back once
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.gameState.battlefields[bf]?.controller).toBe(seat);
}

/**
 * End `seat`'s turn; if asked to choose runes at the end of turn, choose up to `take` of them (only
 * prompts whose options are all that seat's runes are answered — anything else is left to fail loudly).
 * Returns how many rune prompts were answered. Lands in the next player's open main phase.
 */
async function endTurnTakingRunes(game: Game, seat: Seat, take: number): Promise<number> {
  const runeIds = new Set(game.seat(seat).runes());
  let prompts = 0;
  await game.seat(seat).endTurn();
  for (let i = 0; i < 16 && game.turnPlayer() === seat; i++) {
    const d = game.decision();
    // rule 355.7 — "ready up to 2 runes" has no friendly qualifier, so the opponent's runes are offered
    // too; this seat still only ever picks its OWN.
    if (d?.kind === "pick" && d.seat === seat && d.options.some((o) => runeIds.has(o.card ?? o.key))) {
      prompts += 1;
      const exhaustedFirst = [...d.options.filter((o) => runeIds.has(o.card ?? o.key))].sort(
        (a, b) => Number(game.state(b.card ?? b.key).isExhausted) - Number(game.state(a.card ?? a.key).isExhausted),
      );
      const keys = exhaustedFirst.slice(0, Math.min(take, d.max)).map((o) => o.key);
      await (keys.length > 0 ? game.seat(seat).pick(...keys) : game.seat(seat).decline());
    } else if ((await game.settle()).reason === "unanswered") {
      break;
    }
  }
  await game.settle();
  return prompts;
}

describe("Targon's Peak (ogn-289-298)", () => {
  // BUG — expected: a "conquer here" trigger whose effect installs an end-of-turn delayed trigger readying up to 2
  // RUNES. Actual parse: an immediate `ready` of up to 2 UNITS (`target.type: "unit"`, no delay).
  test("registry payload should be conquer-here → delayed end-of-turn ready of up to 2 runes (parsed as an immediate ready of up to 2 units)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Targon's Peak" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effect: { target: { quantity: { upTo: 2 }, type: "rune" }, type: "ready" },
        trigger: { event: "end-of-turn" },
        type: "delayed-trigger",
      },
      trigger: { event: "conquer", location: "here", on: "controller" },
      type: "triggered",
    });
  });

  // BUG (shared by the tests below) — expected per 355.5.b: conquering asks nothing and readies nothing until the
  // Ending Step. Actual: the conquer immediately opens a "Choose a target for Targon's Peak" prompt listing UNITS.
  test("conquering the Peak scores normally but asks nothing and readies nothing right now (355.5.b) — runes stay tapped for the rest of my turn", async () => {
    const game = await board(3).build();
    await conquer(game, P1, "raider", "peak");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // no free mid-turn energy
    expect(game.p1.can("tapRune")).toBe(false);
  });

  test("core line — 3 tapped runes, conquer, end turn → choose 2 → during P2's turn P1 sits on exactly 2 ready runes and 1 exhausted", async () => {
    const game = await board(3).build();
    await conquer(game, P1, "raider", "peak");
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    // rule 315.1.b + 315.3.b: P2's own Beginning Phase readies their 2 runes and channels 2 more (also ready).
    // Nothing to do with the Peak — it only ever touches the conquering player's runes.
    expect(game.p2.runes({ ready: true })).toHaveLength(4);
    expect(game.p2.runes({ ready: false })).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("the choice is made AT END OF TURN (355.5.b): runes that were ready at conquer time and tapped afterwards are the ones readied", async () => {
    const game = await board(0, 2).hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Two-drop" }, "twodrop").build();
    await conquer(game, P1, "raider", "peak");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    await game.p1.tapRunes(2);
    await game.p1.play("twodrop", { to: "base" });
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("'up to 2' — with a single exhausted rune that one is readied; and the chooser may take ZERO (355.13)", async () => {
    const one = await board(1, 2).build();
    await conquer(one, P1, "raider", "peak");
    expect(await endTurnTakingRunes(one, P1, 2)).toBe(1);
    expect(one.turnPlayer()).toBe(P2);
    expect(one.p1.runes({ ready: true })).toHaveLength(3);

    const zero = await board(3).build();
    await conquer(zero, P1, "raider", "peak");
    expect(await endTurnTakingRunes(zero, P1, 0)).toBe(1);
    expect(zero.turnPlayer()).toBe(P2);
    expect(zero.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("RUNES only — the exhausted conqueror (a unit) is never offered and stays exhausted through P2's turn", async () => {
    const game = await board(3).build();
    await conquer(game, P1, "raider", "peak");
    expect(game.state("raider").isExhausted).toBe(true);
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("raider").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  // BUG — expected (471.2.a): only conquering HERE triggers the Peak. Actual: conquering the other battlefield also
  // fires it (the `location: "here"` restriction is not honoured) and the unit-target prompt opens at once.
  test("negative space — 'here': conquering a DIFFERENT battlefield while the Peak is in play schedules nothing; my tapped runes stay tapped all through P2's turn", async () => {
    const game = await board(3).build();
    await conquer(game, P1, "raider", "plain");
    expect(game.p1.points()).toBe(1);
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
  });

  test("negative space — HOLDING the Peak is not conquering it (469.1/469.2): hold, tap all three runes, end turn → zero ready runes during P2's turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("peak", { controller: P1, def: CARD, inert: false })
      .unit(P1, "peak", { might: 3, name: "Holder" }, "holder")
      .runes(P1, "fury", 3, { exhausted: true })
      .fillDecks({ main: 10, runes: 0 }) // no channel noise: P1 keeps exactly 3 runes
      .build();
    await game.advanceTurn(); // P2 ends → P1 awakens (runes ready), holds the Peak (1 pt), reaches main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    await game.p1.tapRunes(3);
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("'you' = the conquering player — P2 takes the Peak on P2's turn: P2 chooses 2 of P2's runes at the end of P2's turn; P1 is never asked", async () => {
    const game = await board(3).active(P2).build();
    await conquer(game, P2, "bystander", "peak");
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(await endTurnTakingRunes(game, P2, 2)).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.runes({ ready: true })).toHaveLength(2); // readied at the end of P2's turn, untouched by P1's Awaken
  });

  test("392 — the scheduled ready survives losing the Peak: conquer, then Bolt my own conqueror (control lapses), end turn → still choose and ready 2 runes", async () => {
    const game = await board(3, 1).hand(P1, BOLT, "bolt").build();
    await conquer(game, P1, "raider", "peak");
    await game.p1.tapRune();
    await game.p1.cast("bolt", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.peak?.controller).toBe(null);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // 3 seeded exhausted + the one just tapped
    expect(await endTurnTakingRunes(game, P1, 2)).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.points()).toBe(1); // the conquer point is kept regardless
  });
});
