/**
 * Ruling 0682fbf962257d2f — Dazzling Aurora (OGN-160 → ogn-160-298) · Body Gear · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it,
 *    ignoring its cost, and recycle the rest."
 *   × Brynhir Thundersong (ogn-026-298) · 5 Might — "When you play me, opponents can't play cards this turn."
 *
 * Q: If Aurora pulls out Brynhir at end of turn, does she lock the opponent out of their whole next turn?
 * A: No. Aurora triggers in a step of YOUR Ending Phase; Brynhir is played and her "this turn" lock applies to what is left
 *    of your turn, then "this turn" effects wear off (a later end-of-turn step) before the opponent's turn begins.
 * Rules: 317.1 (end-of-turn triggers), 317.2 (Expiration Step: "this turn" effects end), 315 (next turn begins after),
 *        419.4.a (Brynhir's play trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const BRYNHIR = "ogn-026-298";
const DISCIPLINE = "ogn-058-298"; // non-unit on top of P1's deck (recycled) and P2's Reaction witness
const FILLER = "ogn-175-298";

/**
 * P1's turn, about to end. Aurora in P1's base; P1's deck: Discipline, Brynhir, filler…  P2 holds bf1 with a Sentry, has a
 * Discipline (Reaction, [2]) and a cheap Recruit in hand with [3] floating (this turn) + 3 calm runes (for its own turn).
 */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .deck(P1, [DISCIPLINE, BRYNHIR, FILLER, FILLER], ["topSpell", "brynhir", "f1", "f2"])
    .hand(P2, DISCIPLINE, "p2disc")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" }, "recruit")
    .runes(P2, "calm", 3)
    .resources(P2, { energy: 3 });
}

/** End P1's turn; resolve Aurora (Brynhir revealed → banished → played, destination answered if asked) up to Brynhir's trigger on the chain. */
async function auroraPlaysBrynhir(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (game.chain().some((c) => c.cardId === "brynhir")) {
      break;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.some((o) => o.key === "base") ? "base" : (d.options[0]?.key as string));
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 0682fbf962257d2f — Brynhir via Aurora locks only the rest of YOUR turn, not the opponent's next turn", () => {
  test("Aurora resolves inside P1's Ending Phase: Discipline recycled, Brynhir banished-then-PLAYED for free, and her play trigger is on the chain — still P1's turn", async () => {
    const game = await auroraPlaysBrynhir();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(["base", "bf2"]).toContain(game.locationOf("brynhir") as string);
    expect(game.state("brynhir").controller).toBe(P1);
    expect(game.p1.deck().at(-1)).toBe("topSpell");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "brynhir", controller: P1, triggered: true }));
  });

  test("her trigger resolves during P1's turn: P2 may still React BEFORE it resolves; once it has resolved the lock is a 'this turn' effect of P1's turn — it is listed among the effects P1's own Expiration Step removed, i.e. it never reaches P2's turn", async () => {
    const game = await auroraPlaysBrynhir();
    // Before it resolves P2 still gets a window and may React in it.
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().some((c) => c.cardId === "brynhir")).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    // Resolve Brynhir's trigger; the Ending Phase then completes (Expiration Step) and only THEN does P2's turn begin.
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "brynhir"); i++) {
      await game.acting().passPriority();
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    const passes = game.trace().expiration;
    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes.flatMap((p) => p.expired)).toContain("cannotPlayCardsThisTurn"); // set during P1's turn, expired with it
    expect(game.gameState.cannotPlayCardsThisTurn?.[P2] ?? false).toBe(false);
  });

  test("P2's turn begins normally: P2 CAN play cards (taps a rune, plays the Recruit; Discipline is castable too) — Brynhir did not make the opponent's turn useless", async () => {
    const game = await auroraPlaysBrynhir();
    await game.settle();
    if (game.turnPlayer() === P1) {
      await game.advanceTurn();
    }
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    await game.p2.tapRunes(3);
    expect(game.p2.can("play", "recruit")).toBe(true);
    await game.p2.play("recruit", { to: "base" });
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    expect(game.state("brynhir").controller).toBe(P1); // she is still on P1's board, lock long gone
    expect(game.violations()).toEqual([]);
  });
});
