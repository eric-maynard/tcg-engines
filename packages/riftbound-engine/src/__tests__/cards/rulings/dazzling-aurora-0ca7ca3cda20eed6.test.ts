/**
 * Ruling 0ca7ca3cda20eed6 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · 9 + [B][B]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and
 *    banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) 8 Might [Deflect] "You may play me to an occupied enemy battlefield."
 *
 * Q: Aurora's end-of-turn trigger reveals Deadbloom Predator, played to an occupied battlefield — does the
 *    resulting combat cause a second end-of-turn (and re-trigger Aurora)?
 * A: No. Aurora resolves completely first (recycling included); the staged combat then happens inside the
 *    same end-of-turn sequence; when it resolves the turn simply ends. Two Auroras would both trigger once.
 * Rules: 317 (Ending Phase triggers), 460/461 (staged combat begins after the resolving item finishes).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const CLEAVE = "ogn-004-298"; // a spell (revealed and recycled)
const SKULKER = "ogn-175-298"; // a later unit that must NOT be revealed by a phantom second trigger

/** P1's turn, about to end. Aurora in P1's base; deck: Cleave, Predator, Skulker, Cleave. P2 holds bf1 with a 3-Might Holder. */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [CLEAVE, DEADBLOOM_PREDATOR, SKULKER, CLEAVE], ["s1", "pred", "later", "s2"]);
}

/** End P1's turn and pass priority until Aurora's play of the Predator asks where it goes (or the flow moves on). */
async function toDestinationPrompt(game: Game): Promise<Decision | null> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return d;
  }
  return game.decision();
}

describe("Ruling 0ca7ca3cda20eed6 — Aurora into Deadbloom Predator at end of turn: one end-of-turn, combat inside it", () => {
  test("Aurora triggers exactly once in the Ending Phase and fully resolves (spell recycled, Predator out of the deck) before anything about the Predator's arrival is decided", async () => {
    const game = await board().build();
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // where the free Predator is played
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    // Aurora's own work is complete: s1 was revealed and recycled to the bottom, 'later' never revealed.
    const deck = game.p1.deck();
    expect(deck[0]).toBe("later");
    expect(deck.at(-1)).toBe("s1");
    expect(deck).not.toContain("pred");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
  });

  // Expected: Predator's "You may play me to an occupied enemy battlefield" applies to Aurora's free play too,
  // so bf1 (enemy, occupied) is offered; choosing it stages a combat that is fought while it is still P1's
  // Ending Phase; Predator (8) kills Holder (3) and conquers; then the turn passes to P2 with no second
  // Ending Phase — Aurora does not trigger again and 'later' stays on top of the deck.
  // Actual: the engine offers only "base" as the destination for the Aurora-played Predator.
  test("ruling 0ca7ca3cda20eed6 — bf1 offered for the Aurora-played Predator, combat fought inside P1's ending phase, then P2's turn with no Aurora re-trigger", async () => {
    const game = await board().build();
    const d = await toDestinationPrompt(game);
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bf1");
    await game.p1.answer({ keys: ["battlefield-bf1"], kind: "pick" });
    // Drain any chain passes; the staged combat opens during the SAME ending phase.
    for (let i = 0; i < 6; i++) {
      const x = game.decision();
      if (x?.kind === "action" && x.context === "chain") {
        await game.seat(x.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("pred").combatRole).toBe("attacker");
    // Combat resolves, then the turn just ends.
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    // No second end of turn: Aurora did not fire again — the next unit is still on top, nothing else was played.
    expect(game.p1.deck()[0]).toBe("later");
    expect(game.zoneOf("later")).toBe("mainDeck");
    expect(game.chain()).toEqual([]);
  });

  test("no second end-of-turn even on the engine's current line (Predator to base): after Aurora resolves the turn passes to P2, Aurora fired once, 'later' is still the top card", async () => {
    const game = await board().build();
    const d = await toDestinationPrompt(game);
    if (d?.kind === "pick") {
      await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("pred")).not.toBe("mainDeck");
    expect(game.p1.units()).toContain("pred");
    expect(game.p1.deck()[0]).toBe("later"); // a phantom second trigger would have dug to (and played) it
    expect(game.zoneOf("later")).toBe("mainDeck");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("two Dazzling Auroras: both trigger at the one end of turn and both go on the chain", async () => {
    const game = await board().gear(P1, DAZZLING_AURORA, "aurora2").build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    // Same-controller simultaneous triggers may first be offered for ordering (P1 chooses).
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    const items = game.chain().filter((c) => c.triggered && (c.cardId === "aurora" || c.cardId === "aurora2"));
    expect(items.map((c) => c.cardId).toSorted()).toEqual(["aurora", "aurora2"]);
  });
});
