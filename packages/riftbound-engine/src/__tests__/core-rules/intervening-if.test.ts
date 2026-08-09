/**
 * Core rules — INTERVENING IF (rule 383.2.a.1).
 *
 *   383.2.a    the Condition is the "When / At / the Nth time" clause.
 *   383.2.a.1  "Any additional conditional statement immediately after the Condition must be true in
 *              order for the Condition to be fulfilled. Such a conditional statement is part of the
 *              Trigger Condition and not the Effect." While it is false the ability does not trigger
 *              at all — no Chain Item, so nobody ever gets a priority window over it. The rule's own
 *              Sona example adds: "If she is removed in reaction to the triggered ability, it will
 *              still resolve" — the clause is checked ONCE, when the event is processed, and NOT
 *              again on resolution.
 *              Its counter-example (Loose Cannon, "…, draw 1 if you have one or fewer cards in your
 *              hand") shows the trailing form: not immediately after the trigger, so it is part of
 *              the effect and read only while the item resolves.
 *
 * Engine model: the clause belongs on the triggered ability's `condition`, which
 * `trigger-runner.ts evaluateTriggerCondition` answers BEFORE `addToChain`. Card data that models it
 * as a resolution-time `conditional` effect instead (the scraped VEN ability JSON) is normalised
 * against the printed text by `enrich-cards.ts hoistInterveningIfConditions`, so a false clause
 * cannot leak onto the Chain.
 *
 * Cards: Eclipse Dragon ven-016-166 ([Accelerate]; "When I move, if you control 4 or fewer runes,
 * draw 1."), Strategic Retreat ogn-104-298 ([Reaction] "Return a friendly unit to its owner's hand.
 * Its owner channels 1 rune exhausted.").
 */

import { describe, expect, test } from "bun:test";
import { getAllCards } from "@tcg/riftbound-cards";
import { P1, scenario } from "../../harness";

const DRAGON = "ven-016-166";
const RETREAT = "ogn-104-298";
const FILLER = "ogn-175-298";

/** P1 active, Eclipse Dragon in base, an empty bf1 to walk to, `runes` runes in P1's pool. */
function dragonWith(runes: number) {
  return scenario()
    .active(P1)
    .battlefield("bf1")
    .runes(P1, "fury", runes)
    .unit(P1, "base", DRAGON, "dragon")
    .deck(P1, [FILLER, FILLER, FILLER], ["D1", "D2", "D3"])
    .fillDecks({ main: 10, runes: 10 });
}

describe("383.2.a.1 — a false intervening if creates no Chain Item at all", () => {
  test("Eclipse Dragon moving while its controller has 6 runes puts nothing on the Chain and draws nothing", async () => {
    const game = await dragonWith(6).build();
    const handBefore = game.p1.hand().length;

    await game.p1.move("dragon", "bf1");

    // The clause was false as the move was processed, so the ability never
    // triggered — no item, hence no priority window over it.
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore);
  });

  test("with 4 runes the same move DOES trigger: the item reaches the Chain and draws on resolution", async () => {
    const game = await dragonWith(4).build();
    const handBefore = game.p1.hand().length;

    await game.p1.move("dragon", "bf1");

    expect(game.chain()).toMatchObject([{ cardId: "dragon", triggered: true }]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.hand()).toContain("D1");
  });

  test("the clause is NOT re-checked on resolution: channeling a 5th rune in the priority window does not stop the draw", async () => {
    const game = await dragonWith(4)
      .resources(P1, { energy: 3, power: { order: 3 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, RETREAT, "retreat")
      .build();

    await game.p1.move("dragon", "bf1");
    expect(game.chain()).toHaveLength(1);

    // Reaction held over the queued trigger: bouncing the ally channels a rune
    // for its owner, so P1 controls 5 runes before the trigger resolves.
    await game.p1.cast("retreat", { targets: "ally" });
    await game.settle();

    expect(game.p1.runes()).toHaveLength(5);
    // Sona example under 383.2.a.1 — the item was legally created, so it still
    // resolves in full even though its clause has since become false.
    expect(game.p1.hand()).toContain("ally");
    expect(game.p1.hand()).toContain("D1");
  });
});

describe("383.2.a.1 — every printed intervening if is modelled as a trigger condition", () => {
  test("no card leaves a leading 'if' clause as a resolution-time conditional effect", () => {
    const leadingIf = /^(?:When|Whenever|At)\b[^,]*,\s*if\b/i;
    const offenders: string[] = [];
    for (const card of getAllCards()) {
      const rulesText = String((card as { rulesText?: string }).rulesText ?? "");
      if (!rulesText.split("\n").some((line) => leadingIf.test(line.trim()))) {
        continue;
      }
      for (const ability of (card as { abilities?: readonly unknown[] }).abilities ?? []) {
        const a = ability as {
          type?: string;
          condition?: unknown;
          effect?: { type?: string; else?: unknown };
        };
        if (
          a.type === "triggered" &&
          a.condition === undefined &&
          a.effect?.type === "conditional" &&
          a.effect.else === undefined
        ) {
          offenders.push(card.id);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
