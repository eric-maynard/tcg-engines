/**
 * Interaction: Reinforce (ogn-062-298) · Action spell · Calm · [5]
 *     "Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then play it, reducing its
 *      cost by [5]. Recycle the remaining cards."
 *   × a revealed unit whose remaining cost after the [5] reduction is a bare Power pip the performer can only pay by
 *     recycling a rune from their own Rune Pool.
 *
 * Rules: 356.4 / 359.3.e.6 + riftjudge 1bf52a7cfc76b405 ("you may BANISH a unit from among them, THEN play it": the
 * banish is its own instruction, so a unit the performer cannot pay for right now is still a legal pick — it stays
 * banished if the play cannot happen), 444.2.c / 429.3 / 429.3.a (Add abilities — recycling a rune for Power — are
 * usable whenever resources must be paid, INCLUDING mid-resolution while the prompt is open), 164.2.b / 594 (a rune in
 * the Rune Pool recycles for 1 Power of its Domain), 356.4 (the [5] reduction).
 *
 * Expected: the [mind]-pip unit is offered alongside the pip-less ones, and the Mind rune the same prompt lets the
 * performer recycle is what pays for it. Observed before the fix: it was omitted from the option list (priced against
 * the current pool only), even though recycling a Mind rune while the same prompt was open made it appear.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const PIPLESS = { cardType: "unit", energyCost: 2, might: 2, name: "Pipless One" } as const;
const PIPLESS_B = { cardType: "unit", energyCost: 3, might: 1, name: "Pipless Two" } as const;
const PIP_UNIT = {
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  might: 3,
  name: "Pip Unit",
  powerCost: ["mind"],
} as const;
const FILLER = { cardType: "spell", energyCost: 1, name: "Filler Spell" } as const;

/**
 * P1's turn, Open state. P1 pays [5] for Reinforce out of 8 energy and holds only Chaos Power afterwards — but two
 * READY Mind runes sit in P1's Rune Pool, each recyclable for [mind] while the pick prompt is open.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .runes(P1, "mind", 2)
    .hand(P1, REINFORCE, "reinforce")
    .deck(P1, [PIPLESS, PIP_UNIT, PIPLESS_B, FILLER, FILLER], ["a", "pip", "b", "f1", "f2"]);
}

const cardsOf = (d: ReturnType<import("../../../harness").Game["decision"]>) =>
  d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];

describe("Reinforce offers its banish-then-play pick before the pip is paid, and the same prompt lets you recycle the rune that pays it", () => {
  test("the [mind]-pip unit (2 energy + [mind]; the [5] reduction leaves just the pip) is offered even though the pool holds no Mind Power (banish-first pick, riftjudge 1bf52a7cfc76b405)", async () => {
    const game = await board().build();
    await game.p1.cast("reinforce");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(cardsOf(d)).toContain("a");
    expect(cardsOf(d)).toContain("b");
    expect(cardsOf(d)).toContain("pip");
    expect(game.violations()).toEqual([]);
  });

  test("picking it is answerable: the [mind] rune is recycled inside the open prompt and the pick then resolves into the play", async () => {
    const game = await board().build();
    await game.p1.cast("reinforce");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.recycleRune({ domain: "mind" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 2, mind: 1 } });
    await game.p1.pick("pip");
    await game.settle();
    expect(game.zoneOf("pip")).not.toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });
});
