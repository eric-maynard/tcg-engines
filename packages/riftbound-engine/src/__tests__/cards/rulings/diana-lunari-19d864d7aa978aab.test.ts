/**
 * Ruling 19d864d7aa978aab — Diana, Lunari (UNL-079 → unl-079-219, 3 Might)
 *   "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main Deck.
 *    If it's a spell, draw it."
 *   × Gust (ogn-169-298, Reaction, 1) "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Diana moves alone onto an EMPTY battlefield; if she is Gusted back to hand in response, does her ability still work?
 * A: Yes. Moving onto an open battlefield starts a (non-combat) showdown → the trigger fires. Once on the chain the
 *    ability is independent of Diana; Gust resolving first does not remove it. It then resolves in full: pay [1],
 *    Predict, reveal, draw the spell.
 * Rules: 344.2 (non-combat showdown), 383 (triggered abilities are chain items independent of their source), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-079-219";
const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298"; // a spell to sit on top of P1's deck

/** P1's turn. bf1 open and empty. P1: Diana in base, 1 energy; deck top = Discipline (spell), then a unit. P2: Gust + 1 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", DIANA, "diana")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, [DISCIPLINE, "ogn-175-298", "ogn-175-298"], ["topspell", "u1", "u2"])
    .hand(P2, GUST, "gust");
}

/** Answer Diana's "you may pay [1]" (whenever the engine asks it) with yes; keep the Predict card on top. */
async function answerDianaPrompts(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      return;
    }
    if (d.kind === "yes-no") {
      // pay [1]: yes; "recycle it?" (Predict): no
      await (/pay|Diana|optional/i.test(d.prompt) && !/recycle/i.test(d.prompt)
        ? game.p1.yes()
        : game.p1.no());
    } else if (d.kind === "pick") {
      await game.p1.decline(); // Predict: don't recycle
    } else if (d.kind === "deck-arrange") {
      await game.p1.answer({ kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      return;
    }
  }
}

describe("Ruling 19d864d7aa978aab — Diana's showdown trigger still resolves after she is Gusted to hand in response", () => {
  test("moving Diana alone onto the empty bf1 begins a non-combat showdown and puts her trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bf1");
    await answerDianaPrompts(game); // the opt-in may be asked at finalization
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      active: true,
      battlefieldId: "bf1",
    });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "diana", controller: P1, triggered: true }),
    ]);
  });

  test("P2 Gusts Diana in response (LIFO: Gust resolves first, Diana → hand); the trigger stays on the chain and then resolves: [1] paid, top card revealed is a spell → drawn", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bf1");
    await answerDianaPrompts(game);
    // P1 holds priority first over their own trigger; pass it to P2, who answers with Gust.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    await game.p1.pass();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "diana" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["diana", "gust"]);
    // Gust resolves first.
    await game.p2.pass();
    await game.p1.pass();
    expect(game.zoneOf("diana")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    // Diana's ability is still a chain item although its source left the board.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", triggered: true })]);
    // Let it resolve; answer pay / Predict prompts.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await answerDianaPrompts(game);
      if (game.chain().length === 0) {
        break;
      }
      await game.acting().pass();
    }
    await answerDianaPrompts(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(0); // [1] was paid
    expect(game.p1.hand().sort()).toEqual(["diana", "topspell"]); // the revealed spell was drawn
    expect(game.p1.deck()[0]).toBe("u1");
    expect(game.violations()).toEqual([]);
  });
});
