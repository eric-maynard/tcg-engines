/**
 * Ruling 53ab1bac58675971 — Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · Mind · [2][mind] · 2 Might · [Hidden]
 *   "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for
 *    each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · [Deflect] (opponents pay [rainbow] to choose me).
 *
 * Q: Teemo is revealed from hidden against an attacking Deadbloom Predator — must its effect be used and the
 *    Deflect cost paid?
 * A: Yes. Revealing (playing from hidden) costs nothing; Teemo's defend trigger is mandatory and must choose an
 *    enemy unit here, so the Predator's Deflect ([rainbow]) must be paid — total cost 1, not 2.
 * Rules: 811 (play from hidden for [0]), 383 (mandatory "When" trigger — no "may"), Deflect keyword (additional
 *        cost to choose), 355 (choosing is required when the instruction says "choose").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const TIDETURNER = "ogn-199-298"; // a [Hidden] card for Teemo's reveal count

/**
 * P2's turn. P1 holds bf1 with a 3-Might Guard and Teemo facedown there; P1 has exactly ONE [rainbow] and no
 * energy. P1's deck (top first): Hidden, plain, Hidden, plain, plain, Sixth… → 2 Hidden among the top 5.
 * P2's Deadbloom Predator (ready, in base) attacks bf1.
 */
function board(p1Power: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 0, power: p1Power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", DEADBLOOM_PREDATOR, "predator")
    .deck(
      P1,
      [TIDETURNER, { cardType: "unit", might: 1, name: "Plain A" }, TIDETURNER, { cardType: "unit", might: 1, name: "Plain B" }, { cardType: "spell", name: "Plain C" }, { cardType: "unit", might: 1, name: "Sixth" }],
      ["h1", "pa", "h2", "pb", "pc", "sixth"],
    );
}

/** Predator attacks bf1, P2 passes Focus, P1 plays Teemo from hidden. */
async function revealTeemo(game: Game): Promise<void> {
  await game.p2.move("predator", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "teemo")).toBe(true);
  await game.p1.reveal("teemo");
}

describe("Ruling 53ab1bac58675971 — Teemo revealed into Deadbloom's attack: free reveal, mandatory trigger, Deflect must be paid (1 total)", () => {
  test("revealing costs nothing: Teemo enters bf1 as a Defender with P1's lone [rainbow] untouched, and its 'When I defend' trigger is on the chain", async () => {
    const game = await board().build();
    await revealTeemo(game);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
  });

  test("paying the Predator's Deflect is the ONLY cost (1 rune total): P1's [rainbow] goes to 0, the top 5 are revealed (2 Hidden) → Predator takes 2, and the five revealed cards are recycled under the deck", async () => {
    const game = await board().build();
    await revealTeemo(game);
    // The engine surfaces the Deflect payment to P1 (the only enemy unit here is the Predator).
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(true);
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("predator");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // exactly one rune's worth, for Deflect
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("predator").damage).toBe(2);
    expect(game.p1.deck()[0]).toBe("sixth"); // the 5 revealed cards left the top …
    expect(game.p1.deck().slice(-5).toSorted()).toEqual(["h1", "h2", "pa", "pb", "pc"]); // … and were recycled to the bottom
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 53ab1bac58675971 reads Teemo's trigger as mandatory all the way through the
  // Predator's [Deflect] payment ("must be used and the Deflect cost paid"). rule 404.2 says the opposite, and
  // says it directly: "players may decline to pay for Triggered Abilities that have incurred a cost. If they do,
  // the ability will cease being a Pending Item and be removed from the Chain." Deflect makes choosing the
  // Predator an INCURRED cost on Teemo's pending item, so P1 may decline it at finalization; the item is removed
  // and — per rule 404.2.a — that is NOT the ability being countered. The engine follows the CR (opt-in prompt
  // at FIN, `abilities/trigger-finalization.ts finalizePendingItems`), consistent with the already-passing
  // ruling 0f7901bdeb46f6a7 facet. What is mandatory is the CHOICE once the cost is paid, not the payment.
  test("engine: the Predator's [Deflect] is an incurred cost on Teemo's pending trigger, so P1 may decline it — the item leaves the Chain uncountered with the rune unspent (rule 404.2)", async () => {
    const game = await board().build();
    await revealTeemo(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect((d as { canAccept?: boolean }).canAccept).toBe(true);
    const declined = await game.p1.try((p) => p.no());
    expect(declined.ok).toBe(true); // rule 404.2 — declining an incurred cost is a legal answer
    expect(game.chain()).toEqual([]); // removed as a Pending Item; it never becomes finalized
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // nothing was paid
    expect(game.state("predator").damage).toBe(0); // the trigger's damage never happens
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // rule 404.2.a — not a counter; Teemo still defends
    expect(game.p1.deck()[0]).toBe("h1"); // nothing revealed, nothing recycled
    expect(game.violations()).toEqual([]);
  });
});
