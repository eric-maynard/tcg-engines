/**
 * Interaction: Swift Scout (ogn-263-298) — Legend (Teemo), "You may pay [1] to hide a card with
 *     [Hidden] instead of [rainbow]."
 *   × Switcheroo (sfd-145-221) — [Hidden] [Action] spell, printed [2][chaos][chaos],
 *     "Swap the Might of two units at the same battlefield this turn."
 *
 * The question is about PRICE QUOTING on the Hide control, and about what is charged:
 *   1 energy / no power  → is Hide offered, and is the quoted price the Scout's [1]?
 *   0 energy / 1 power   → is the printed [rainbow] route still there?
 *   both                 → are BOTH prices shown so the player elects one, and is only that one spent?
 *   neither              → is Hide shown with a reason, or does it vanish?
 *   and next turn, the facedown play must quote [0], not the printed [2][chaos][chaos].
 *
 * Rules covered (riftbound-rules ids):
 *   811.1.b       [Hidden]: on your turn in an Open State pay [rainbow] to hide facedown at a
 *                 battlefield you control with no facedown card there; beginning next turn it gains
 *                 [Reaction] and may be played ignoring its base cost
 *   811.1.c.1     Hide is NOT a subset of Play — it is a Discretionary Action of your own turn
 *   135.2.e.5.b   [rainbow] Power spends against a Power cost of any Domain…
 *   163.2         …because Power pays Domain-associated Power costs
 *   357.1         the combined Energy + Power cost is paid in full
 *   477.3.a       cost values are what the increase/decrease layer operates on — the number the
 *                 control quotes is the number that must be charged
 */
import { describe, expect, test } from "bun:test";
import type { ActionOption } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWIFT_SCOUT = "ogn-263-298";
const SWITCHEROO = "sfd-145-221";

type Pool = { energy?: number; power?: Record<string, number> };

/** P1's Main Phase, one battlefield P1 controls with two units on it, Switcheroo in hand. */
function board(pool: Pool, withScout = true) {
  const s = scenario()
    .turn(4)
    .active(P1)
    .resources(P1, pool)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Small One" }, "small")
    .unit(P1, "bf1", { might: 5, name: "Big One" }, "big")
    .hand(P1, SWITCHEROO, "sw");
  if (withScout) {
    s.legend(P1, SWIFT_SCOUT, "scout");
  }
  return s;
}

/** Every cost-ish field a client could read a price off the Hide control. */
function priceFields(opt: ActionOption | undefined): string[] {
  return (opt?.fields ?? []).map((f) => f.name).filter((n) => /cost|pay|price|alt|energy|power/i.test(n));
}

describe("Swift Scout × Switcheroo — what the Hide control offers and what it charges", () => {
  test("Scout + [1] Energy and no Power: Hide IS offered — and without the Scout that same pool cannot hide at all (811.1.b)", async () => {
    const withScout = await board({ energy: 1 }).build();
    expect(withScout.p1.can("hide", "sw")).toBe(true);
    expect(withScout.p1.option("hide", "sw")?.fields.find((f) => f.name === "battlefieldId")?.options).toEqual(["bf1"]);

    // 811.1.b prices Hide at [rainbow]; Energy pays nothing there. The Scout is the whole reason
    // the Energy-only pool works, so removing it must remove the action.
    const noScout = await board({ energy: 1 }, false).build();
    expect(noScout.p1.can("hide", "sw")).toBe(false);
    expect(noScout.p1.option("hide", "sw")).toBeUndefined();
  });

  test("Scout + [1] Energy: hiding charges the Energy and touches no Power (357.1)", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.hide("sw", "bf1");
    expect(game.zoneOf("sw")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("0 Energy + 1 Power: the printed [rainbow] route survives the Scout and is what gets spent (135.2.e.5.b / 163.2)", async () => {
    const game = await board({ power: { chaos: 1 } }).build();
    expect(game.p1.can("hide", "sw")).toBe(true);
    await game.p1.hide("sw", "bf1");
    expect(game.zoneOf("sw")).toBe("facedown-bf1");
    // The [rainbow] pip came out of the chaos Power; the (absent) Energy was never needed.
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });

  test.failing("BUG: the Hide control quotes NO price — neither [1] nor [rainbow] appears on the option, so a client cannot show what it is about to spend (477.3.a / 357.1)", async () => {
    const game = await board({ energy: 1 }).build();
    const opt = game.p1.option("hide", "sw");
    expect(opt).toBeDefined();
    // Expected: some priced field / quote naming the [1] the Scout charges.
    // Actual: the only field is `battlefieldId` — the move carries no cost information at all,
    // so the price is invisible until the pool changes underneath the player.
    expect(priceFields(opt)).not.toEqual([]);
  });

  test.failing("BUG: with BOTH [1] Energy and [rainbow] available the player is given no election — one variant only, and the Power is spent while the Energy is kept (811.1.b + 'you MAY pay [1] … instead')", async () => {
    const game = await board({ energy: 1, power: { chaos: 1 } }).build();
    const opt = game.p1.option("hide", "sw");

    // Expected: two priced routes to elect between (Swift Scout's [1] vs the printed [rainbow]).
    // Actual: `variantCount` is 1 and no cost field exists, so the choice never reaches the player.
    expect(opt?.variantCount).toBeGreaterThan(1);

    // Expected: electing the Scout's [1] spends the Energy and leaves the Power.
    // Actual: `deductHideCost` prefers Power and only falls back to Energy when no Power is left,
    // so this board always pays the pip — the Scout's line is unreachable while any Power exists.
    await game.p1.hide("sw", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
  });

  test("with NEITHER resource pooled, Hide is refused and absent from the menu; one recycle brings it back (404.2)", async () => {
    const game = await board({}).runes(P1, "chaos", 2).build();

    // DESIGN: paying is manual (DESIGN.md §Paying costs — a deliberate deviation from 357.1.a /
    // 429.3): the engine prices the pool AS IT STANDS and never credits a rune it could tap or
    // recycle, so Hide is absent rather than listed-with-a-reason.
    expect(game.p1.can("hide", "sw")).toBe(false);
    expect(game.p1.option("hide", "sw")).toBeUndefined();
    await expect(game.p1.hide("sw", "bf1")).rejects.toThrow();
    expect(game.zoneOf("sw")).toBe("hand");

    // Not a blank panel: the runes that would fund it are right there in the menu…
    const verbs = game.p1.legal().map((o) => o.verb);
    expect(verbs).toContain("tapRune");
    expect(verbs).toContain("recycleRune");
    expect(verbs).toContain("endTurn");

    // …and using one is the whole fix, either way round (Scout's [1] or the printed [rainbow]).
    const viaPower = await board({}).runes(P1, "chaos", 2).build();
    await viaPower.p1.recycleRune(undefined, "chaos");
    expect(viaPower.p1.can("hide", "sw")).toBe(true);

    await game.p1.tapRune();
    expect(game.p1.can("hide", "sw")).toBe(true); // the Scout's Energy route
  });

  test("Hide is a Discretionary Action of YOUR turn, not a play (811.1.c.1): it is not offered on the opponent's turn", async () => {
    const game = await board({ energy: 1, power: { chaos: 2 } }).build();
    await game.advanceTurn(); // → P2's Main Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("hide", "sw")).toBe(false);
    expect(game.zoneOf("sw")).toBe("hand");
  });

  test("next turn the facedown play costs [0], not the printed [2][chaos][chaos] — it is offered and resolves on a completely empty pool (811.1.b)", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.hide("sw", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });

    await game.advanceTurn(); // P2's turn
    await game.advanceToTurnOf(P1); // back to P1, facedown card now playable

    // The pool is empty: if the printed [2][chaos][chaos] were being charged this could not be offered.
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.can("reveal", "sw")).toBe(true);

    await game.p1.reveal("sw");
    await game.settle();

    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // charged nothing
    // …and the spell really resolved: the two Mights are swapped.
    expect(game.state("small").might).toBe(5);
    expect(game.state("big").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
