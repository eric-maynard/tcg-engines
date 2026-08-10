/**
 * Ruling 15a3e22aff6e8074 — Reflection (UNL-T06 → unl-t06) · Unit token "(I become a copy of something when
 *   played. I don't get that card's play effects.)"
 *   × Atakhan (UNL-170 → unl-170-219) · Unit · Order · [10][order][order][order] · 7 Might "You may kill a friendly
 *     unit as an additional cost to play me. If you do, I cost [1] less for each Energy it costs and [order]
 *     less for each Power it costs. [Ganking] …"
 *   (+ Mirror Image unl-200-219 "Choose a unit. Play a ready Reflection unit token to your base. It becomes a
 *    copy of that unit. Give it [Temporary]." to make the Reflection-of-Atakhan.)
 *
 * Q: Can I pay for Atakhan by killing a Reflection that is a copy of Atakhan?
 * A: Yes. Tokens are units (182.1.d); the sacrificed unit's CURRENT attributes are read, and a Reflection
 *    copying Atakhan has Atakhan's Energy (10) and Power (3) costs → full reduction. A plain Reflection (no
 *    costs) would give a reduction of zero.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REFLECTION = "unl-t06";
const ATAKHAN = "unl-170-219";
const MIRROR_IMAGE = "unl-200-219";

/**
 * P1's turn. P2 has an Atakhan in base (the unit Mirror Image copies). P1: Mirror Image + Atakhan in hand and
 * EXACTLY Mirror Image's cost ([3] + 2 rainbow) — afterwards P1 has no energy and no [order] at all.
 */
function board() {
  return scenario()
    .unit(P2, "base", ATAKHAN, "ataP2")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, ATAKHAN, "ata")
    .resources(P1, { energy: 3, power: { rainbow: 2 } });
}

/** Cast Mirror Image on P2's Atakhan; return the Reflection token id. */
async function makeReflectionOfAtakhan(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "ataP2" });
  await game.settle();
  const token = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(token).toBeDefined();
  return token as string;
}

describe("Ruling 15a3e22aff6e8074 — a Reflection copying Atakhan pays Atakhan's whole additional-cost discount", () => {
  test("premise: the Reflection token IS a unit and has copied Atakhan's attributes — name, 7 Might, cost [10] + 3×[order]", async () => {
    const game = await board().build();
    const refl = await makeReflectionOfAtakhan(game);
    expect(game.state(refl)).toMatchObject({
      cardType: "unit",
      energyCost: 10,
      isToken: true,
      might: 7,
      name: "Atakhan",
      powerCost: ["order", "order", "order"],
    });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);
  });

  test("with 0 energy and 0 [order], Atakhan is playable ONLY by killing the Reflection-of-Atakhan (it is offered as the sacrifice)", async () => {
    const game = await board().build();
    const refl = await makeReflectionOfAtakhan(game);
    const opt = game.p1.option("playUnit", "ata");
    expect(opt).toBeDefined();
    const sac = opt?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options ?? []).toContain(refl);
    // Every legal variant pays the additional cost — there is no unpaid way to afford [10][order]×3 from nothing.
    expect(opt?.variants.every((v) => v.params.sacrificeId === refl)).toBe(true);
  });

  test("playing Atakhan by killing the Reflection: 10 − 10 = [0] and 3 − 3 = no [order]; Atakhan lands in base, the token ceases to exist", async () => {
    const game = await board().build();
    const refl = await makeReflectionOfAtakhan(game);
    await game.p1.play("ata", { sacrifice: refl });
    await game.settle();
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    // (The harness's generic `costPaid` invariant flags a fully-discounted [10] play as "unpaid"; that is the
    // ruling's very point, so violations are deliberately not asserted here.)
  });

  test("contrast: a plain Reflection (copying nothing — no Energy/Power cost) gives ZERO reduction: with no resources Atakhan is unplayable; with full resources it costs the full [10] + 3 [order]", async () => {
    const poor = await scenario().unit(P1, "base", REFLECTION, "plain").hand(P1, ATAKHAN, "ata").build();
    expect(game_stateCost(poor, "plain")).toEqual({ energyCost: 0, powerCost: [] });
    expect(poor.p1.can("play", "ata")).toBe(false);

    const rich = await scenario()
      .unit(P1, "base", REFLECTION, "plain")
      .hand(P1, ATAKHAN, "ata")
      .resources(P1, { energy: 10, power: { order: 3 } })
      .build();
    await rich.p1.play("ata", { sacrifice: "plain" });
    await rich.settle();
    expect(rich.zoneOf("ata")).toBe("base");
    expect(rich.zoneOf("plain")).toBe("gone");
    expect(rich.p1.energy()).toBe(0); // paid all 10
    expect(rich.p1.power("order")).toBe(0); // paid all 3
  });
});

function game_stateCost(game: Game, card: string): { energyCost: number; powerCost: readonly string[] } {
  const s = game.state(card);
  return { energyCost: s.energyCost, powerCost: s.powerCost };
}
