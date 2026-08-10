/**
 * Interaction: Forgotten Relic (ven-108-166) · Gear · Chaos · 5
 *     "When you play this or at the start of your Beginning Phase, [Burn 1]. When you burn a unit this
 *      way, do this: Give a friendly unit +[Might] equal to the burned card's Might this turn."
 *   × Shadow Temple (ven-165-166) · Battlefield · "When you hold here, [Burn 3]."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla — the unit holding the Temple)
 *
 * Question: Burn (440) hitting an empty deck, and whether a Hold point at 7 outruns a Burn trigger. P1
 * controls Shadow Temple with a Vanguard Sergeant on it since last turn. P1's Main Deck AND trash are
 * both EMPTY. P2 is on 5. P1's turn begins.
 *   (a) P1 on 7 and ALSO controls Forgotten Relic: does the Relic's Burn 1 resolve before the Scoring
 *       Step's Hold? Burn 1 into empty deck+trash — how many Burn Outs, does 7-7 stop anything, who wins,
 *       does P1 ever Hold?
 *   (b) P1 on 7, NO Relic: P1 Holds for its 8th point — restricted like a Conquer final point? Shadow
 *       Temple's Burn 3 triggers: does P1 win before it resolves, or does the Burn loop feed P2 first?
 *   (c) P1 on 6, no Relic: Hold → 7, then Burn 3 into the empty deck — outcome?
 *   (d) P1 on 7 with Relic but deck = [D1] (a spell): outcome?
 *
 * Rules: 315.2.a.1 (start-of-Beginning-Phase effects precede the Scoring Step 315.2.b.2), 440.4 (Burn as
 * part of an effect: burn what you can, Burn Out, burn the rest), 431.1.b / 431.2.b–d (Burn Out: recycle
 * trash → deck, an opponent gains 1, complete the remainder), 431.3 / 431.3.a (empty trash → the retry
 * Burns Out again, repeatedly), 431.3.c / 431.3.c.1 (a post-first Burn-Out point that reaches the Victory
 * Score AND exceeds every opponent wins IMMEDIATELY, no cleanup needed), 469.2 (Hold), 471.1.a.1 / 471.1.b
 * (the Final-Point restriction is Conquer-only), 319.3 + 323.1 / 472 (a pending item schedules a Cleanup,
 * which checks the win).
 *
 * Expected: (a) Relic trigger first; Burn 1 → Burn Out ×3 (P2 6, 7 — tie, no win — 8 > 7 → P2 wins at
 * once); P1 never Holds, Temple never triggers; final 7-8. (b) Hold → 8 (unrestricted); the Temple trigger
 * pends → Cleanup → P1 wins with 8 > 5 before Burn 3 resolves; zero Burn Outs. (c) Hold → 7; Burn 3 → Burn
 * Out ×3 → P2 8 > 7 → P2 wins; final 7-8. (d) Relic burns D1 (no Burn Out, spell → no buff), Hold → 8 → P1
 * wins at the Cleanup; Burn 3 never resolves; P2 5; P1 trash {D1}.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_RELIC = "ven-108-166";
const SHADOW_TEMPLE = "ven-165-166";
const VANGUARD_SERGEANT = "ogn-219-298";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit — P2's deck only
const D1_SPELL = "ogn-229-298"; // Vengeance — a SPELL to be the lone card of P1's deck in (d)

interface Setup {
  readonly p1Points: number;
  readonly relic: boolean;
  /** P1's main deck, top first (default: EMPTY). P1's trash is always empty. */
  readonly p1Deck?: readonly string[];
}

/**
 * P2 is about to end turn 2. Victory Score 8; P2 on 5; P1 on `p1Points`. P1 controls a LIVE Shadow
 * Temple with a Vanguard Sergeant standing on it (so the Scoring Step will Hold it). No deck filler:
 * P1's Main Deck is exactly `p1Deck` (default none) and P1's trash is empty; P2 gets three known cards so
 * only P1 can ever Burn Out. `relic` puts Forgotten Relic into P1's base.
 */
function board(s: Setup) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, s.p1Points)
    .points(P2, 5)
    .fillDecks({ main: 0, runes: 12 })
    .battlefield("temple", { controller: P1, def: SHADOW_TEMPLE, inert: false, owner: P1 })
    .unit(P1, "temple", VANGUARD_SERGEANT, "sarge")
    .deck(P2, [FILLER, FILLER, FILLER], ["p2a", "p2b", "p2c"]);
  if (s.relic) {
    b.gear(P1, FORGOTTEN_RELIC, "relic");
  }
  if (s.p1Deck) {
    b.deck(P1, s.p1Deck, s.p1Deck.map((_, i) => `d${i + 1}`));
  }
  return b;
}

/** Build, sanity-check the premise, and have P2 end the turn → P1's Beginning Phase. */
async function p1TurnBegins(s: Setup): Promise<Game> {
  const game = await board(s).build();
  expect(game.p1.deck()).toEqual(s.p1Deck ? s.p1Deck.map((_, i) => `d${i + 1}`) : []);
  expect(game.p1.trash()).toEqual([]);
  expect(game.p1.points()).toBe(s.p1Points);
  expect(game.p2.points()).toBe(5);
  expect(game.gameState.battlefields.temple?.controller).toBe(P1);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

const templeItem = expect.objectContaining({ cardId: "temple", controller: P1, name: "Shadow Temple", triggered: true });
const relicItem = expect.objectContaining({ cardId: "relic", controller: P1, name: "Forgotten Relic", triggered: true });

describe("Forgotten Relic vs Shadow Temple at 7 — Burn into an empty deck vs. the Hold point", () => {
  // ── (a) P1 7, Relic, empty deck + empty trash ─────────────────────────────────────────────────

  test("(a) ordering: at the start of P1's Beginning Phase the Relic's trigger is on the chain BEFORE any Hold is scored — P1 still 7, no Shadow Temple item yet (315.2.a.1 before 315.2.b)", async () => {
    const game = await p1TurnBegins({ p1Points: 7, relic: true });
    expect(game.chain()).toEqual([relicItem]);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(5);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) Burn 1 into an empty deck with an empty trash Burns Out repeatedly: P2 5 → 6 → 7 (7-7 tie is not a win) → 8 > 7 → P2 WINS immediately, mid-resolution — exactly 3 Burn Outs (431.1.b, 431.3, 431.3.c/.c.1)", async () => {
    const game = await p1TurnBegins({ p1Points: 7, relic: true });
    await game.p1.passPriority();
    expect(game.isOver()).toBe(false); // nothing happens until both pass
    await game.p2.passPriority(); // Relic resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(5 + 3); // one point per Burn Out, and it stopped at the winning one
    expect(game.p1.deck()).toEqual([]); // nothing was ever recycled in or burned
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toBeNull(); // no "burned a unit" follow-up: nothing was burned
  });

  // BUG — expected (431.3.c.1: P2 wins immediately during the Beginning Step, the game ends there): P1
  // never reaches the Scoring Step, never Holds, Shadow Temple never triggers → final score 7-8 with an
  // empty chain. Actual: after flagging P2 the winner the flow still runs the Scoring Step — P1 is
  // credited a Hold point (8-8) and a "Shadow Temple" hold trigger is put on the chain of a finished game.
  test("(a) the game ends at P2's win — P1 never Holds (stays 7) and Shadow Temple never triggers (431.3.c.1)", async () => {
    const game = await p1TurnBegins({ p1Points: 7, relic: true });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(7);
    expect(game.chain()).toEqual([]);
  });

  // ── (b) P1 7, no Relic ────────────────────────────────────────────────────────────────────────

  test("(b) with no Relic the Scoring Step Holds Shadow Temple for P1's 8th point — a Hold point is NOT subject to the Conquer-only Final-Point restriction (469.2, 471.1.a.1)", async () => {
    const game = await p1TurnBegins({ p1Points: 7, relic: false });
    expect(game.p1.points()).toBe(8);
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
  });

  test("(b) the 'When you hold here' trigger pends → that Cleanup sees 8 ≥ VS and 8 > 5 → P1 WINS right there, with the Burn 3 item still unresolved on the chain; zero Burn Outs, P2 stays 5 (319.3, 323.1/472)", async () => {
    const game = await p1TurnBegins({ p1Points: 7, relic: false });
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.chain()).toEqual([templeItem]); // finalized as pending, never resolved
    expect(game.p2.points()).toBe(5);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toBeNull(); // nobody is given priority in a finished game
  });

  // ── (c) P1 6, no Relic ────────────────────────────────────────────────────────────────────────

  test("(c) from 6 the Hold makes it 7 — no win at the Cleanup — and the Shadow Temple item waits on the chain with P1 holding priority", async () => {
    const game = await p1TurnBegins({ p1Points: 6, relic: false });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([templeItem]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.points()).toBe(5);
  });

  test("(c) Burn 3 then resolves into deck 0 / trash 0: Burn Out ×3 → P2 6, 7 (tie), 8 > 7 → P2 WINS immediately mid-ability; final 7-8 — holding the Temple at 6 with nothing left LOSES the game (440.4, 431.3.a, 431.3.c.1)", async () => {
    const game = await p1TurnBegins({ p1Points: 6, relic: false });
    await game.p1.passPriority();
    expect(game.isOver()).toBe(false);
    await game.p2.passPriority(); // Burn 3 resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(8); // exactly 3 Burn Outs
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.phase()).toBe("beginning"); // it ended before Channel / Draw
    expect(game.decision()).toBeNull();
  });

  test("(c) contrast with (b): the very same Hold one point higher (7 → 8) wins instead of losing — the Burn 3 never gets to resolve", async () => {
    const at7 = await p1TurnBegins({ p1Points: 7, relic: false });
    expect(at7.winner()).toBe(P1);
    expect(at7.p2.points()).toBe(5);
    const at6 = await p1TurnBegins({ p1Points: 6, relic: false });
    await at6.settle();
    expect(at6.winner()).toBe(P2);
    expect(at6.p2.points()).toBe(8);
  });

  // ── (d) P1 7, Relic, deck = [D1 spell] ────────────────────────────────────────────────────────

  test("(d) with one card (a spell) in the deck the Relic's Burn 1 simply burns D1 — no Burn Out (P2 stays 5), no 'burned a unit' buff prompt, Sergeant still 4 Might", async () => {
    const game = await p1TurnBegins({ p1Deck: [D1_SPELL], p1Points: 7, relic: true });
    expect(game.chain()).toEqual([relicItem]);
    expect(game.p1.points()).toBe(7); // Hold not scored yet
    await game.p1.passPriority();
    await game.p2.passPriority(); // Relic resolves
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.p1.trash()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(5);
    expect(game.state("sarge").might).toBe(4);
  });

  test("(d) …then the Scoring Step Holds → P1 8 → P1 WINS at the Cleanup exactly as in (b): Shadow Temple's Burn 3 is left pending and never resolves (P1's now-empty deck is never touched again), P2 5", async () => {
    const game = await p1TurnBegins({ p1Deck: [D1_SPELL], p1Points: 7, relic: true });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(5);
    expect(game.chain()).toEqual([templeItem]);
    expect(game.p1.trash()).toEqual(["d1"]); // only the Relic's burn — none of the Temple's three
    expect(game.p1.deck()).toEqual([]);
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.decision()).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
