/**
 * Ruling b13da8e05e2089d3 — Nocturne, Horrifying (OGN-194 → ogn-194-298) × Stacked Deck (OGN-183 → ogn-183-298)
 *   Nocturne: "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *   for [rainbow]."   Stacked Deck: "[Action] Look at the top 3 cards of your Main Deck. Put 1 into your hand and
 *   recycle the rest."   Seal of Discord (ogn-204-298): "[Exhaust]: [Reaction] — [Add] [chaos]."
 *
 * Q: Can Nocturne's [rainbow] be paid with a Seal "as a reaction", or must the power be floated beforehand?
 * A: Yes, a Seal works. Banished Nocturne goes pending on the chain; the looking card (Stacked Deck) finishes
 *    resolving first (1 to hand, rest recycled); only then is Nocturne finalized and its cost paid — and while
 *    paying you may add resources, including by exhausting a Seal. Floating power ahead of time also works.
 * Rules: 356.1.a (alternative cost), 359.3.e.6 / 354.2 (pending item finalized after the resolving card),
 *        429.3 / 444.2.c (Add-Reactions while a cost is being paid).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const STACKED_DECK = "ogn-183-298";
const SEAL_OF_DISCORD = "ogn-204-298";
const SKULKER = "ogn-175-298";

function board(power: Record<string, number> = {}) {
  return scenario()
    .resources(P1, { energy: 1, power })
    .gear(P1, SEAL_OF_DISCORD, "seal")
    .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
    .hand(P1, STACKED_DECK, "sd");
}

const offeredVerbs = (d: Decision | null): string[] => {
  if (!d) {
    return [];
  }
  if (d.kind === "action") {
    return d.options.map((o) => `${o.verb}:${o.card ?? "-"}`);
  }
  if (d.kind === "yes-no" || d.kind === "pick" || d.kind === "integer") {
    return (d.actions ?? []).map((o) => `${o.verb}:${o.card ?? "-"}`);
  }
  return [];
};

/** Cast Stacked Deck and accept Nocturne's "you may banish me". */
async function castAndBanish(game: Game): Promise<void> {
  await game.p1.cast("sd");
  expect(game.p1.energy()).toBe(0);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes();
  expect(game.zoneOf("noc")).toBe("banishment");
}

describe("Ruling b13da8e05e2089d3 — Nocturne's [rainbow] off Stacked Deck can be paid with a Seal at pay time", () => {
  test("power floated ahead of time: Nocturne goes pending on the chain, Stacked Deck fully resolves (1 to hand, rest recycled) BEFORE Nocturne is finalized and its [rainbow] is actually paid", async () => {
    const game = await board({ chaos: 1 }).build();
    await castAndBanish(game);
    // "if you do, you may play me for [rainbow]" — the opt-in
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    await game.p1.yes();
    // Nocturne is now a pending item; Stacked Deck carries on with its own instruction first.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(game.chain().map((c) => c.cardId)).toContain("noc");
    expect(game.zoneOf("sd")).toBe("chain");
    expect(game.p1.power("chaos")).toBe(1); // not paid yet — payment is at finalization, after Stacked Deck
    await game.p1.pick("s1");
    await game.settle();
    // Stacked Deck done: s1 in hand, s2 recycled, spell in trash — and only now has Nocturne been paid for and landed.
    expect(game.p1.hand()).toEqual(["s1"]);
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.p1.deck().at(-1)).toBe("s2");
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // DESIGN: the ruling's second half (rule 429.3 / 444.2.c / 357.1.a — "Add" resources WHILE a cost is being paid) is
  // deliberately NOT implemented. DESIGN.md § "Paying costs": paying is manual, and a play is only OFFERED when the
  // CURRENT pool already covers its total cost — a ready Seal, an uncracked Gold or an untapped rune is never credited
  // and never auto-exhausted. So with an empty pool Nocturne's "you may play me for [rainbow]" is not offered at all
  // and the banished card is stranded. Floating the power BEFORE looking (the passing test above) is the supported path.
  test("DESIGN (pool-only affordability): with an empty pool the [rainbow] play is never offered even though a ready Seal could add it — Nocturne stays banished", async () => {
    const game = await board().build();
    await castAndBanish(game);
    // Walk forward: no "play me for [rainbow]" opt-in ever appears.
    let offer: Decision | null = null;
    for (let i = 0; i < 6; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
        offer = d;
        break;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
        await game.p1.pick(d.options[0]?.key as string);
        continue;
      }
      break;
    }
    expect(offer).toBeNull();
    // Stacked Deck still resolves normally; the Seal is untouched and only usable once the main phase reopens.
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.state("seal").isExhausted).toBe(false);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(offeredVerbs(game.decision())).toContain("activate:seal");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
