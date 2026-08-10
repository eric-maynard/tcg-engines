/**
 * Ruling b0cbd09803720f9b — Darius, Trifarian (OGN-027 → ogn-027-298) · [5][fury] · 5 Might · "When you play your second card in a turn,
 *     give me +2 [Might] this turn and ready me."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · [3][chaos] · 3 Might · "When you play me, you may play a spell from your trash with Energy
 *     cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *   (trash spell: Discipline ogn-058-298 · [2] · "Give a unit +2 [Might] this turn. Draw 1.")
 *
 * Q: Darius, then Fizz, then Fizz's ability plays a spell — is Darius's ready "missed"?
 * A: No. Fizz IS the second card: Darius (already on the board) triggers the moment Fizz is played — +2 and readied. Fizz's
 *    "When you play me" then plays the spell as the THIRD card, which neither adds nor removes anything for Darius.
 * Rules: 383 (triggered abilities; condition checked when the event happens), 419.4 (a card played via an effect still counts
 *        as played), 811.1.c.3 (units enter exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const FIZZ = "sfd-140-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn with exactly [8] + fury + chaos. Darius + Fizz in hand, Discipline in the trash, known deck top; P2's Guard (4) at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P1, DARIUS, "darius")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, DISCIPLINE, "disc")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Card 1: Darius (enters exhausted, no trigger). Card 2: Fizz. Stops right after Fizz is played. */
async function dariusThenFizz(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("darius");
  await game.settle();
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  expect(game.chain()).toEqual([]);
  await game.p1.play("fizz");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
  return game;
}

/** Accept Fizz's "you may", take the offered trigger order, and pass until Discipline needs a target; aim it at Fizz. */
async function driveThrough(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "order") {
      expect(d).toMatchObject({ kind: "order", seat: P1 }); // both triggers are P1's and simultaneous
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      await game.p1.pick((keys.includes("disc") ? "disc" : "fizz") as string);
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
}

describe("Ruling b0cbd09803720f9b — Fizz as the second card readies Darius; Fizz's trash spell (card #3) changes nothing", () => {
  test("the moment Fizz (card #2) is played, Darius's trigger is on the chain together with Fizz's 'When you play me' — Darius did not miss anything", async () => {
    const game = await dariusThenFizz();
    const ids = game.chain().map((c) => c.cardId).sort();
    expect(ids).toEqual(["darius", "fizz"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.zoneOf("disc")).toBe("trash"); // Fizz's spell has not been played yet
  });

  test("Darius's trigger resolves: +2 (5 → 7) and READY — before Fizz's ability has played anything (still 2 cards played)", async () => {
    const game = await dariusThenFizz();
    for (let i = 0; i < 12 && game.chain().some((c) => c.cardId === "darius"); i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.p1.yes();
      } else if (d?.kind === "order") {
        expect(d.seat).toBe(P1);
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("then Fizz's ability plays Discipline from the trash as card #3 (free, recycled afterwards, draws 1): Darius stays ready at 7 — no extra trigger, nothing undone", async () => {
    const game = await dariusThenFizz();
    await driveThrough(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
    expect(game.zoneOf("disc")).toBe("mainDeck"); // recycled after being played
    expect(game.p1.hand()).toEqual(["d1"]); // Discipline's draw
    expect(game.state("fizz")).toMatchObject({ location: "base", might: 5 }); // Discipline's +2 went on Fizz
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
