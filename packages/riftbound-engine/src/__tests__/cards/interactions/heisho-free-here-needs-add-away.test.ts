/**
 * Interaction: Heisho, Shell of the World (ven-158-166) · Battlefield —
 *     "Players ignore [Deflect] while paying for spells and abilities choosing something here."
 *   × Pouty Poro (ogn-013-298) · 2-Might unit —
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Super Mega Death Rocket! (ogn-252-298) · 4 energy + [rainbow], "Deal 5 to a unit."
 *
 * Question: two IDENTICAL Poros, one at Heisho and one at the other battlefield, inside ONE target
 * picker. [Deflect] is priced per chosen object, so Heisho waives only the instalment for the object
 * chosen HERE — the two Poros carry different prices in the same prompt: 0 at Heisho, 1 elsewhere.
 *   (a) Is the Heisho Poro fully selectable with no surcharge, while the away Poro stays LISTED but
 *       unaffordable (a recycle could fund it — 809.1.d hides only what NOTHING could fund)?
 *   (b) Is a pick of the away Poro refused with the state untouched, and selectable after one recycle?
 *   (c) Is the quoted shortfall the cheapest unpayable option (one [rainbow]), not a sum over all
 *       Deflect bodies?
 *   (d) Control with one Power pooled up front: both selectable, and the pool is spent ONLY on the
 *       away pick.
 *   (e) Does the Heisho Poro still READ as having [Deflect] (the waiver is on paying, not the keyword)?
 *
 * Build check: (a) is meaningless on a build where an unaffordable candidate is simply absent, because
 * "listed dimmed" would then be indistinguishable from "not listed". So the file pins both directions:
 * a positive control proves the away Poro IS enumerable (with the pip pre-pooled) before the BUG test
 * asserts it must also be enumerated while the pip is only reachable.
 *
 * Rules: 809.1.c ("for each time they choose me" — priced per chosen object), 809.1.c.1 (the surcharge
 * is Power of ANY Domain), 809.1.d (a surcharge nothing could fund makes the object not a legal choice
 * — the ONLY reason to drop a candidate), 809.3 (the object keeps the keyword; only the payment is
 * waived), 356.2.a.2 (Deflect is a mandatory additional cost), 355.5 (targets are chosen as the spell
 * is played), 429.3 / 429.3.a / 357.1.a (a [Reaction] [Add] is legal whenever a cost must be paid and
 * re-derives affordability), 164.2.b (a surcharge is Power — only a recycle adds Power).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEISHO = "ven-158-166";
const POUTY_PORO = "ogn-013-298";
const ROCKET = "ogn-252-298";

/** The set of card ids the cast option offers as `targets`. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. Heisho holds one enemy Poro; an identical enemy Poro sits at an ordinary battlefield.
 * P1 has the Rocket's full base cost (4 energy + 1 [rainbow]) and `runes` ready runes to recycle.
 * `power` sets how much pooled Power there is on top of nothing — 1 is exactly the base cost.
 */
function board(power: number, runes = 0) {
  let s = scenario()
    .resources(P1, { energy: 4, power: { rainbow: power } })
    .battlefield("bfH", { controller: P2, def: HEISHO, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bfH", POUTY_PORO, "hereporo")
    .unit(P2, "bf2", POUTY_PORO, "awayporo")
    .hand(P1, ROCKET, "rocket");
  for (let i = 0; i < runes; i++) {
    s = s.rune(P1, "fury", { alias: `k${i}` });
  }
  return s;
}

describe("Heisho — the Deflect waiver is per chosen object, so one picker carries two prices", () => {
  // ── the waiver itself ─────────────────────────────────────────────────────────────────────────

  test("with exactly the base cost pooled, only the Heisho Poro is affordable — and choosing it charges NOTHING extra (809.1.c waived here by 766/767)", async () => {
    const game = await board(1).build();
    expect(targetsOffered(game, "rocket")).toContain(game.card("hereporo"));
    await game.p1.cast("rocket", { targets: "hereporo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 4 energy + 1 base pip only
    await game.settle();
    expect(game.zoneOf("hereporo")).toBe("trash"); // 5 damage on a 2-Might body
  });

  test("(d) control with a spare pip pooled: the Heisho pick still leaves it untouched, and the away pick spends it — same card, same prompt, two prices (809.1.c)", async () => {
    const here = await board(2).build();
    await here.p1.cast("rocket", { targets: "hereporo" });
    expect(here.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // the spare pip survives

    const away = await board(2).build();
    expect(targetsOffered(away, "rocket").sort()).toEqual(
      [away.card("awayporo"), away.card("hereporo")].sort(),
    );
    await away.p1.cast("rocket", { targets: "awayporo" });
    expect(away.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // base pip + the [Deflect] pip
    await away.settle();
    expect(away.zoneOf("awayporo")).toBe("trash");
  });

  test("(e) the waiver is on the PAYMENT, not on the keyword: the Poro at Heisho still reads as having [Deflect] (809.3)", async () => {
    const game = await board(1).build();
    expect(game.state("hereporo").keywords).toContain("Deflect");
    expect(game.state("awayporo").keywords).toContain("Deflect");
    expect(game.state("hereporo").defId).toBe(game.state("awayporo").defId); // identical bodies
  });

  test("without Heisho the here-Poro is taxed exactly like the away one: with only the base cost pooled and nothing to recycle, the Rocket has no legal target at all and is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bfH", { controller: P2 }) // plain battlefield, no waiver
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bfH", POUTY_PORO, "hereporo")
      .unit(P2, "bf2", POUTY_PORO, "awayporo")
      .hand(P1, ROCKET, "rocket")
      .build();
    expect(game.p1.option("cast", "rocket")).toBeUndefined();
    expect(game.p1.can("cast", "rocket")).toBe(false);
  });

  // ── (b) what is refused is the ANSWER, and an Add fixes it ────────────────────────────────────

  test("(b) picking the away Poro with the surcharge unpaid is refused and leaves the state byte-identical — nothing spent, nothing moved, the Rocket still in hand", async () => {
    const game = await board(1, 1).build();
    const before = { hand: game.p1.hand(), pool: game.p1.resources(), runes: game.p1.runes() };
    const attempt = await game.p1.try((p) => p.cast("rocket", { targets: "awayporo" }));
    expect(attempt.ok).toBe(false);
    expect(game.p1.resources()).toEqual(before.pool);
    expect(game.p1.hand()).toEqual(before.hand);
    expect(game.p1.runes()).toEqual(before.runes);
    expect(game.zoneOf("awayporo")).toBe("battlefield-bf2");
    expect(game.state("awayporo").damage).toBe(0);
  });

  test("(b) one recycle is the whole fix: the away Poro becomes selectable and the cast then spends base pip + surcharge (164.2.b, 809.1.c.1 — any Domain pays it)", async () => {
    const game = await board(1, 1).build();
    expect(targetsOffered(game, "rocket")).not.toContain(game.card("awayporo"));
    await game.p1.recycleRune("k0"); // a [fury] Power, which still pays the [rainbow] surcharge
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, rainbow: 1 } });
    expect(targetsOffered(game, "rocket").sort()).toEqual(
      [game.card("awayporo"), game.card("hereporo")].sort(),
    );
    await game.p1.cast("rocket", { targets: "awayporo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("awayporo")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (a)/(c) the BUG: the reachable-but-unpaid candidate is dropped instead of dimmed ──────────

  test.failing("BUG: a [Deflect] surcharge a rune Add could still fund makes the away Poro DISAPPEAR from the play-time target list instead of staying listed-and-unaffordable — 809.1.d drops a candidate only when NOTHING could fund it (429.3/357.1.a)", async () => {
    // Expected: with 1 pooled [rainbow] (the base cost) and one ready rune, BOTH Poros are enumerated —
    // the Heisho one free, the away one carrying its 1-pip surcharge and a needsAdd hint — and only the
    // ANSWER is refused until the pip is actually in the pool. That is what 43bb893 established for
    // surcharged `choose-target` / `pick-many` prompts (DESIGN.md §Paying costs, surcharged-pick bullet).
    // Actual: play-time target enumeration is still pool-only, so the away Poro is absent from the
    // `targets` field entirely (proved non-vacuously by the '(d) control' test above, where the same
    // candidate IS enumerated once the pip is pre-pooled). Nothing on a play option carries `surcharge`
    // or `needsAdd`, so the client has nothing to dim and no shortfall to quote.
    const game = await board(1, 1).build();
    expect(targetsOffered(game, "rocket").sort()).toEqual(
      [game.card("awayporo"), game.card("hereporo")].sort(),
    );
  });

  test.failing("BUG: the shortfall a player would need is never quoted at play time — it should be the cheapest unfundable option (ONE [rainbow], the away Poro), not a sum over both Deflect bodies and not silence", async () => {
    // Expected: the cast option advertises what the away pick still owes, e.g. a `needsAdd`-shaped
    // field naming one [rainbow] ("needs [rainbow] — recycle a rune"). Heisho's Poro contributes 0,
    // so the number is 1, never 2.
    // Actual: `ActionField` has no surcharge/needsAdd channel at all — the field carries only `options`.
    const game = await board(1, 1).build();
    const field = game.p1.option("cast", "rocket")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ needsAdd: { power: { rainbow: 1 } } });
  });
});
