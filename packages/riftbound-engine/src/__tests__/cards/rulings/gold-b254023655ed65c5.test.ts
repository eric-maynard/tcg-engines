/**
 * Ruling b254023655ed65c5 — Gold (SFD-T03 → sfd-t03, gear token) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Draven, Vanquisher (SFD-020 → sfd-020-221) "When I attack or defend, you may pay [fury]. If you do, give me +2 [Might]
 *     this turn."
 *
 * Q: Can I use a Gold gear token to pay for Draven, Vanquisher's ability?
 * A: Not directly — a token is not a payment. But you may activate the Gold (kill + exhaust it) to ADD a Power to your Rune
 *    Pool, and then pay Draven's [fury] out of that Power. Sequence: activate Gold → pay its cost (kill it) → Power lands in the
 *    pool → pay Draven with the pooled Power.
 * Rules: 429 (Add abilities put resources in the Rune Pool; Reaction-speed), 158.1 ("you may pay … if you do" — paid from the
 *        Rune Pool on resolution), 135.2.e.5 (any-domain Power covers a named pip), 186.1 (a killed token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GOLD = "sfd-t03";
const DRAVEN = "sfd-020-221";

/** P1's turn, EMPTY pool, one ready Gold token; Draven (4) ready in base; P2's Guard (5) holds bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", DRAVEN, "draven")
    .gear(P1, GOLD, "gold");
}

/**
 * Draven attacks bf1: his attack trigger goes on the chain. If the engine asks the leading "you may" at finalization, P1 opts IN
 * (the [fury] itself is only paid as the item resolves). Returns with P1 holding priority on the trigger.
 */
async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p1.move("draven", "bf1");
  expect(game.state("draven").combatRole).toBe("attacker");
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1 && d.timing === "FIN") {
    await game.p1.yes();
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Pass priority around until Draven's item has resolved (a P1 pay prompt, or the chain is empty). */
async function resolveDravenTrigger(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling b254023655ed65c5 — a Gold token is not itself payment for Draven's [fury], but its [Add] Power is", () => {
  test("not directly: with an empty pool and the Gold left alone, Draven's 'you may pay [fury]' can never be ACCEPTED — the token is never offered or consumed as payment (only its [Add] is, and nothing auto-cracks it), Draven stays 4 and loses to the Guard", async () => {
    const game = await attack();
    // Walk the whole trigger + showdown by passing; wherever P1 is asked to pay, "yes" must be impossible.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        // rule 429.3 / 429.3.a — the ready Gold is a Reaction [Add] the payer could still crack, so
        // the offer is advertised as reachable-after-an-Add (`needsAdd`) rather than hidden. What it
        // is NOT is payable: the token itself is no payment, and paying is manual (DESIGN.md
        // §Paying costs), so with the pool empty "yes" is refused all the same.
        expect(d.needsAdd).toMatchObject({ power: { fury: 1 } });
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        expect(game.state("gold").isExhausted).toBe(false); // never auto-cracked
        await game.p1.no();
      } else if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("gold"); // a token is never a payment option
        break;
      } else if (d.kind === "action" && d.passKey) {
        if (d.context === "showdown") {
          expect(game.state("draven").might).toBe(4); // the trigger resolved without a bonus
        }
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.has("gold")).toBe(true);
    expect(game.zoneOf("draven")).toBe("trash"); // 4 into 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("step 1–3: with Draven's trigger on the chain P1 activates the Gold ([Reaction] [Add]) — the token is killed as the cost and 1 any-domain Power lands in P1's Rune Pool; Draven's item is still waiting", async () => {
    const game = await attack();
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.has("gold")).toBe(false); // killed — a token off the board ceases to exist (186.1)
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.power()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven"]); // [Add] abilities don't use the chain
    expect(game.state("draven").might).toBe(4); // nothing paid to Draven yet
  });

  test("step 4: when Draven's trigger resolves P1 is asked to pay [fury] and the pooled Power covers it: yes → pool 0, Draven +2 (6) this turn, and he beats the 5-Might Guard", async () => {
    const game = await attack();
    await game.p1.activate("gold");
    await resolveDravenTrigger(game);
    // On resolution the payment is demanded (or, if the opt-in already committed P1, simply taken) out of the Rune Pool.
    if (game.decision()?.kind === "yes-no" && game.decision()?.seat === P1) {
      expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "draven" } });
      await game.p1.yes();
    }
    expect(game.p1.power()).toBe(0);
    expect(game.state("draven")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
