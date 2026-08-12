/**
 * Interaction: Garbage Grabber (ogn-099-298) — Gear, "Recycle 3 from your trash, [1], [Exhaust]: Draw 1."
 *   × Dr. Mundo, Expert (ogn-109-298) — "My Might is increased by the number of cards in your trash.
 *     At the start of your Beginning Phase, recycle 3 from your trash."
 *   × Karma, Channeler (ogn-235-298) — "When you recycle one or more cards to your Main Deck,
 *     buff a friendly unit. (Runes aren't cards.)"
 *
 * A 25-turn grind that pushes the same cards through trash and deck over and over. The question is
 * STATE IDENTITY, not "no crash":
 *   (a) does undo() restore the exact pre-activation frame (cards, order, [1], readiness, buff,
 *       Might) and does redo() reproduce a byte-identical one, randomized recycle included?
 *   (b) does a rewind/redo pair at turn 25 leave the same stateHash, and does the whole transcript
 *       still replay to the same finalHash?
 *   (c) with 2 cards in the trash, is the Grabber's activation still offered?
 *   (d) is Mundo's effect-side "recycle 3" at a 2-card trash still legal?
 *
 * Rules covered (riftbound-rules ids):
 *   416 / 416.1     Recycle takes cards from a zone and puts them on the bottom of the deck
 *   416.6           "Recycle X from [Zone]" — X of the player's choice, and if there are fewer than
 *                   X they recycle as many as they can (the rule's own example IS Dr. Mundo)
 *   055             do as much as you can, ignoring impossible instructions
 *   052             runes are not cards when executing card effects
 *   431.1.b         a deck short of the required cards does as much as possible
 *   431.2.b         cards recycled to the Main Deck together must be randomized
 *   358.5           a failed check undoes everything the action did — never a half-paid cost
 */
import { describe, expect, test } from "bun:test";
import type { Game, Policy } from "../../../harness";
import { DEFAULT_INVARIANTS, P1, P2, passivePolicy, replayTranscript, scenario } from "../../../harness";

const GARBAGE_GRABBER = "ogn-099-298";
const DR_MUNDO = "ogn-109-298";
const KARMA = "ogn-235-298";

const JUNK = (n: number) => ({ cardType: "unit", domain: "mind", energyCost: 1, might: 1, name: `Junk ${n}` });

/** Answers the recycle/buff picks these three cards raise; everything else is the passive policy. */
const grindPolicy: Policy = (d, game) => {
  if (d.kind === "pick" && d.min > 0 && d.options.length >= d.min) {
    return { keys: d.options.slice(0, d.min).map((o) => o.key), kind: "pick" };
  }
  return passivePolicy(d, game);
};

/**
 * P1's Main Phase with the whole engine on the board and `trashCount` junk cards in the trash.
 * `victoryScore(99)` keeps holding bfA from ending the game; the big decks keep P2 off Burn Out.
 */
function board(trashCount: number, active = P1) {
  const s = scenario({ seed: "recycle-grind-25" })
    .turn(2)
    .active(active)
    .victoryScore(99)
    .resources(P1, { energy: 3 })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", DR_MUNDO, "mundo")
    .unit(P1, "bfA", KARMA, "karma")
    .gear(P1, GARBAGE_GRABBER, "grabber")
    .runes(P1, "mind", 3)
    .fillDecks({ main: 120, runes: 60 });
  for (let i = 0; i < trashCount; i++) {
    s.trash(P1, JUNK(i), `t${i}`);
  }
  return s;
}

/** Every card P1 owns anywhere it can be — the conservation total. */
function p1Cards(game: Game): number {
  return (
    game.p1.hand().length +
    game.p1.deck().length +
    game.p1.trash().length +
    game.p1.banishment().length +
    game.p1.base().length +
    game.p1.units("bfA").length +
    game.p1.gear().length
  );
}

/** Mundo's Might is exactly base 6 + trash size (+1 while carrying Karma's buff). */
function expectedMundoMight(game: Game): number {
  return 6 + game.p1.trash().length + (game.state("mundo").isBuffed ? 1 : 0);
}

describe("Garbage Grabber × Dr. Mundo × Karma — rewind, redo and the recycle machine over 25 turns", () => {
  test("(a) one undo takes back the WHOLE activation: same three cards in the trash in the same order, [1] refunded, gear ready, no buff, Might restored", async () => {
    const game = await board(6).build();
    const before = {
      energy: game.p1.energy(),
      hash: game.stateHash(),
      might: game.state("mundo").might,
      trash: game.p1.trash(),
    };
    expect(before.might).toBe(6 + 6);

    await game.p1.activate("grabber", 0, { params: { recycleIds: ["t0", "t1", "t2"] } });
    // The cost is paid the instant the activation is declared.
    expect(game.p1.energy()).toBe(before.energy - 1);
    expect(game.state("grabber").isExhausted).toBe(true);
    expect(game.p1.trash()).toEqual(before.trash.filter((c) => !["t0", "t1", "t2"].includes(c)));

    expect(game.undo()).toBe(true);
    expect(game.stateHash()).toBe(before.hash);
    expect(game.p1.trash()).toEqual(before.trash); // same cards AND the same order
    expect(game.p1.energy()).toBe(before.energy);
    expect(game.state("grabber").isExhausted).toBe(false);
    expect(game.state("mundo").isBuffed).toBe(false);
    expect(game.state("mundo").might).toBe(before.might);
    // 358.5 / the costPaid oracle: never a frame with the cost half-paid.
    expect(DEFAULT_INVARIANTS.map((i) => i.name)).toContain("costPaid");
    expect(game.violations()).toEqual([]);
  });

  test("(a) redo() reproduces a byte-identical frame — the randomized multi-card recycle lands in the same order (431.2.b)", async () => {
    const game = await board(6).build();
    const h0 = game.stateHash();

    await game.p1.activate("grabber", 0, { params: { recycleIds: ["t0", "t1", "t2"] }, answers: ["mundo"] });
    await game.settle({ policy: grindPolicy });
    const after = {
      bottom: game.p1.deck().slice(-3),
      buffed: game.state("mundo").isBuffed,
      hand: game.p1.hand().length,
      hash: game.stateHash(),
      might: game.state("mundo").might,
    };
    // Karma saw a card recycle and buffed; the Grabber drew.
    expect(after.buffed).toBe(true);
    expect(after.hand).toBe(1);
    expect(new Set(after.bottom)).toEqual(new Set(["t0", "t1", "t2"]));

    // Rewind the whole activation, one player-facing action at a time.
    let undone = 0;
    while (game.canUndo() && game.stateHash() !== h0 && undone < 12) {
      game.undo();
      undone += 1;
    }
    expect(game.stateHash()).toBe(h0);

    for (let i = 0; i < undone; i++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.stateHash()).toBe(after.hash);
    // The RNG cursor was checkpointed, so the same three cards are at the same bottom slots.
    expect(game.p1.deck().slice(-3)).toEqual(after.bottom);
    expect(game.state("mundo").might).toBe(after.might);
    expect(game.violations()).toEqual([]);
  });

  test("(c) recycle-3 is a COST: with only 2 cards in the trash the Grabber's ability is not offered, and it comes back the moment a third card is there", async () => {
    const short = await board(2).build();
    expect(short.p1.trash()).toHaveLength(2);
    expect(short.p1.can("activate", "grabber")).toBe(false);
    expect(short.p1.option("activate", "grabber")).toBeUndefined();
    await expect(short.p1.activate("grabber", 0, { params: { recycleIds: ["t0", "t1"] } })).rejects.toThrow();
    // Costs are paid in full or not at all — nothing was taken on the way out.
    expect(short.p1.trash()).toHaveLength(2);
    expect(short.p1.energy()).toBe(3);
    expect(short.state("grabber").isExhausted).toBe(false);

    const enough = await board(3).build();
    expect(enough.p1.can("activate", "grabber")).toBe(true);
    // Exactly three cards: one way to pay, so nothing is asked and the whole trash goes.
    expect(enough.p1.option("activate", "grabber")?.variantCount).toBe(1);
    await enough.p1.activate("grabber", 0, { answers: ["mundo"] });
    expect(enough.p1.trash()).toHaveLength(0);

    // With more than three, WHICH three is the player's choice (416.6).
    const plenty = await board(5).build();
    const field = plenty.p1.option("activate", "grabber")?.fields.find((f) => f.name === "recycleIds");
    expect(field).toMatchObject({ min: 3, max: 3 });
    expect(field?.options).toHaveLength(10); // every 3-subset of 5
  });

  test("(d) Mundo's is an EFFECT, not a cost: at a 2-card trash the Beginning-Phase recycle still runs and takes as many as it can (416.6 / 055)", async () => {
    const game = await board(2, P2).build();
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.state("mundo").might).toBe(6 + 2);

    await game.advanceTurn({ policy: grindPolicy }); // P2 ends → P1's Beginning Phase
    await game.settle({ policy: grindPolicy });

    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.trash()).toHaveLength(0); // both taken, no "can't do 3" abort
    expect(game.state("mundo").might).toBe(expectedMundoMight(game));
    expect(game.violations()).toEqual([]);
  });

  test("Karma fires on CARD recycles and never on a rune recycle — runes are not cards (052)", async () => {
    const cards = await board(6).build();
    expect(cards.state("mundo").isBuffed).toBe(false);
    await cards.p1.activate("grabber", 0, { params: { recycleIds: ["t0", "t1", "t2"] }, answers: ["mundo"] });
    await cards.settle({ policy: grindPolicy });
    expect(cards.state("mundo").isBuffed).toBe(true);

    const runes = await board(6).build();
    const runeCount = runes.p1.runes().length;
    expect(runeCount).toBeGreaterThan(0);
    await runes.p1.recycleRune();
    // No buff prompt was raised and nobody got buffed.
    expect(runes.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
    expect(runes.state("mundo").isBuffed).toBe(false);
    expect(runes.state("karma").isBuffed).toBe(false);
    expect(runes.p1.trash()).toHaveLength(6); // the rune went to the rune deck, not the trash
    expect(runes.violations()).toEqual([]);
  });

  test("(b) the 25-turn grind: constant card count, a deck that never empties, no Burn Out, Mundo's Might never drifts — and a rewind/redo pair at turn 25 changes nothing", async () => {
    const game = await board(60).build();
    const startingCards = p1Cards(game);
    let activations = 0;
    let offeredWithShortTrash = 0;
    let minDeck = Number.POSITIVE_INFINITY;

    while (game.turnNumber() < 25) {
      if (game.turnPlayer() === P1) {
        await game.settle({ policy: grindPolicy });
        if (game.p1.energy() < 1 && game.p1.can("tapRune")) {
          await game.p1.tapRune();
        }
        const trashSize = game.p1.trash().length;
        const offered = game.p1.can("activate", "grabber");
        // (c) at turn 1 and at turn 25 alike: the COST gates the offer.
        if (trashSize < 3 && offered) {
          offeredWithShortTrash += 1;
        }
        if (offered) {
          await game.p1.activate("grabber", 0, { params: { recycleIds: game.p1.trash().slice(0, 3) } });
          activations += 1;
          await game.settle({ policy: grindPolicy });
        }
        minDeck = Math.min(minDeck, game.p1.deck().length);
        expect(p1Cards(game)).toBe(startingCards);
        expect(game.state("mundo").might).toBe(expectedMundoMight(game));
      }
      expect(game.isOver()).toBe(false);
      await game.advanceTurn({ policy: grindPolicy });
    }

    expect(game.turnNumber()).toBe(25);
    expect(activations).toBeGreaterThan(5); // the machine really ran
    expect(offeredWithShortTrash).toBe(0);
    expect(minDeck).toBeGreaterThan(0); // the deck never emptied…
    expect(game.p2.points()).toBe(0); // …so no Burn Out ever paid the opponent
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);

    // Both regimes were visited: by turn 25 the trash is drained and the Grabber is off.
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.can("activate", "grabber")).toBe(false);

    // A rewind/redo pair at turn 25 is a no-op on the state.
    const hash25 = game.stateHash();
    let undone = 0;
    for (let i = 0; i < 3 && game.canUndo(); i++) {
      game.undo();
      undone += 1;
    }
    expect(undone).toBe(3);
    expect(game.stateHash()).not.toBe(hash25);
    for (let i = 0; i < undone; i++) {
      expect(game.redo()).toBe(true);
    }
    expect(game.stateHash()).toBe(hash25);
    expect(game.violations()).toEqual([]);
  }, 60_000);

  test("(b) the whole 25-turn transcript replays to the same final hash, step for step", async () => {
    const game = await board(60).build();
    while (game.turnNumber() < 25) {
      if (game.turnPlayer() === P1) {
        await game.settle({ policy: grindPolicy });
        if (game.p1.energy() < 1 && game.p1.can("tapRune")) {
          await game.p1.tapRune();
        }
        if (game.p1.can("activate", "grabber")) {
          await game.p1.activate("grabber", 0, { params: { recycleIds: game.p1.trash().slice(0, 3) } });
          await game.settle({ policy: grindPolicy });
        }
      }
      await game.advanceTurn({ policy: grindPolicy });
    }

    const transcript = game.transcript();
    expect(transcript.steps.length).toBeGreaterThan(50);
    const replay = await replayTranscript(transcript);
    expect(replay.divergedAt).toBeUndefined();
    expect(replay.divergence).toBeUndefined();
    expect(replay.finalHashMatches).toBe(true);
    expect(replay.stepsApplied).toBe(transcript.steps.length);
    expect(replay.game.turnNumber()).toBe(25);
  }, 60_000);
});
