/**
 * Interaction: Fight or Flight (ogn-168-298) · Spell · Chaos · printed [2]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      [Action] — Move a unit from a battlefield to its base."
 *   × Volibear, Furious (ogn-041-298) · Unit · Fury · [10] · 9 Might
 *     "[Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)"
 *
 * Rules: 811.1.b (a card played from Hidden is played IGNORING its base cost), 811.3, 421.3 / 421.2.a
 * ([Hide] — the [A] is spent when hiding, the later play is for [0]), 809.1.c (a [Deflect] surcharge is a
 * MANDATORY additional cost, and only for a spell an OPPONENT controls that chooses the unit),
 * 809.1.c.1 (payable in any Domain), 356.2.a.2 (mandatory additional cost), 357.1 / 358.2 (the total owed
 * must be payable or the play is not legal), 358.4, 723 (Rules Text is never Inactive by default — the
 * rule a facedown tooltip must NOT cite for this).
 *
 * Question: P1 hid Fight or Flight at a battlefield P1 controls and now plays it from facedown.
 *   (a) What is actually CHARGED when it targets P2's Volibear? The base cost is ignored, but [Deflect 2]
 *       is not — so the pay line must read the surcharge, never "free".
 *   (b) Same play targeting one of P1's OWN units at that battlefield — what changes?
 *   (c) With only 1 Power in the pool, is the Volibear line offered at all?
 *
 * Expected: (a) 0 Energy + 2 Power of any Domain. (b) genuinely [0] — Deflect taxes only an opponent's
 * spell, so no surcharge line at all. (c) with 1 Power and nothing on board that could fund the second
 * pip the Volibear line is NOT offered (809.1.d); with a recyclable rune still available it IS listed,
 * carrying the top-up it needs, and the ANSWER stays refused until the pool actually covers it.
 *
 * Teaching (asserted against the printed reminder, the only text surface the harness sees): the card
 * itself says "[Hidden] … react with later for [0]". A tooltip that says the card is played "for its
 * Hidden cost" names the [A] already spent when hiding (421.3), and 723 is not the rule for any of this.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Decision } from "../../../harness";

const FOF = "ogn-168-298";
const VOLI = "ogn-041-298";

/** Two friendly units at bf1 so the target choice is never a sole-option auto-confirm. */
function board(power: Record<string, number>, chaosRunes = 0) {
  const b = scenario()
    .resources(P1, { energy: 0, power })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "HolderA" }, "holderA")
    .unit(P1, "bf1", { might: 2, name: "HolderB" }, "holderB")
    .unit(P2, "bf1", VOLI, "voli")
    .facedown(P1, "bf1", FOF, "fof");
  return chaosRunes > 0 ? b.runes(P1, "chaos", chaosRunes) : b;
}

function targetPick(d: Decision | null) {
  expect(d?.kind).toBe("pick");
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Fight or Flight from Hidden × Volibear [Deflect 2] — [0] base, but the surcharge is the cost", () => {
  test("premise: the printed reminder is the [Hidden] one — 'react with later for [0]' — and Volibear carries [Deflect] (421.3, 809.1.c)", async () => {
    const game = await board({ chaos: 2 }).build();
    const text = game.state("fof").rulesText ?? "";
    expect(text).toContain("[Hidden]");
    expect(text).toContain("for [0]");
    expect(text).not.toContain("Hidden cost");
    expect(game.state("voli").keywords).toContain("Deflect");
    expect(game.zoneOf("fof")).toBe("facedown-bf1");
  });

  test("premise: the [A] is spent when HIDING (421.2.a) — hiding costs 1 Power, and the facedown card then costs nothing to hold", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, FOF, "fof")
      .build();
    await game.p1.hide("fof", "bf1");
    expect(game.zoneOf("fof")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // ---- (a) what is actually charged ---------------------------------------------------------------

  test("(a) the base cost is IGNORED: the play is legal with ZERO Energy pooled even though the card is printed [2] (811.1.b, 421.3)", async () => {
    const game = await board({ chaos: 2 }).build();
    expect(game.state("fof").energyCost).toBe(2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "fof")).toBe(true);
  });

  test("(a) the pay line is NOT 'free': the Volibear option carries the [Deflect 2] surcharge and says so (809.1.c, 356.2.a.2)", async () => {
    const game = await board({ chaos: 2 }).build();
    await game.p1.reveal("fof");
    const pick = targetPick(game.decision());
    const voli = pick.options.find((o) => o.card === "voli");
    expect(voli).toBeDefined();
    expect(voli?.deflect).toBe(2);
    expect(voli?.surcharge).toBe(2);
    expect(voli?.label).toContain("[Deflect]");
  });

  test("(a) charged = 0 Energy + 2 Power of ANY Domain (809.1.c.1): the chaos pool pays the [rainbow][rainbow] tax and the spell resolves", async () => {
    const game = await board({ chaos: 2 }).build();
    await game.p1.reveal("fof");
    await game.p1.pick("voli");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.locationOf("voli")).toBe("base");
    expect(game.state("voli").controller).toBe(P2);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) targeting your own unit -----------------------------------------------------------------

  test("(b) targeting P1's OWN unit: no [Deflect] surcharge is listed — Deflect only taxes an opponent's spell (809.1.c)", async () => {
    const game = await board({ chaos: 2 }).build();
    await game.p1.reveal("fof");
    const pick = targetPick(game.decision());
    const mine = pick.options.find((o) => o.card === "holderA");
    expect(mine).toBeDefined();
    expect(mine?.deflect).toBeUndefined();
    expect(mine?.surcharge).toBeUndefined();
    expect(mine?.label).not.toContain("[Deflect]");
  });

  test("(b) and it is genuinely [0]: the friendly-target play charges nothing at all", async () => {
    const game = await board({ chaos: 2 }).build();
    await game.p1.reveal("fof");
    await game.p1.pick("holderA");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2 } });
    expect(game.locationOf("holderA")).toBe("base");
    expect(game.locationOf("voli")).toBe("bf1");
  });

  // ---- (c) one Power in the pool -------------------------------------------------------------------

  test("(c) 1 Power and nothing that could fund the second pip: the Volibear line is absent, not offered-then-refused (809.1.d, 357.1)", async () => {
    const game = await board({ chaos: 1 }).build();
    await game.p1.reveal("fof");
    const pick = targetPick(game.decision());
    expect(pick.options.map((o) => o.card)).toEqual(["holderA", "holderB"]);
    expect(pick.options.some((o) => o.card === "voli")).toBe(false);
  });

  test("(c) 1 Power but a recyclable rune still in the pool: Volibear IS listed, dimmed, with the top-up that unlocks it (429.3, 357.1.a)", async () => {
    const game = await board({ chaos: 1 }, 1).build();
    await game.p1.reveal("fof");
    const pick = targetPick(game.decision());
    const voli = pick.options.find((o) => o.card === "voli");
    expect(voli?.surcharge).toBe(2);
    expect(voli?.needsAdd?.power).toEqual({ rainbow: 1 });
    expect(voli?.needsAdd?.reason).toContain("recycle");
    // 444.2.c — the Add that would fix it is legal while the prompt is open.
    expect(pick.actions?.some((a) => a.verb === "recycleRune")).toBe(true);
  });

  test("(c) listing is not offering a shortcut: answering the dimmed option is REFUSED and changes nothing, then the recycle makes it legal and charges the full 2", async () => {
    const game = await board({ chaos: 1 }, 1).build();
    await game.p1.reveal("fof");
    const refused = await game.p1.try((p) => p.pick("voli"));
    expect(refused.ok).toBe(false);
    expect(game.locationOf("voli")).toBe("bf1");
    expect(game.p1.power("chaos")).toBe(1);

    await game.p1.recycleRune(game.p1.runes()[0]!, "chaos");
    expect(game.p1.power("chaos")).toBe(2);
    await game.p1.pick("voli");
    await game.settle();
    expect(game.locationOf("voli")).toBe("base");
    expect(game.p1.power("chaos")).toBe(0);
  });
});
