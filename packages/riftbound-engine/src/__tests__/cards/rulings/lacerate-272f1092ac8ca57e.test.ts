/**
 * Ruling 272f1092ac8ca57e — Lacerate (ven-127-166) · Spell · Order · 2 + [order]
 *   "Choose a unit. If it's [Empowered], disempower it. Then kill it if it has 3 [Might] or less.
 *    [Flow] [4][order][order]"
 *   × Gust (ogn-169-298) · Reaction · 1 · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can Lacerate target a unit with more than 3 Might?
 * A: Yes. "Choose a unit" targets any unit (355.7, 355.9.a) — "unit" is only the object category, no Might
 *    restriction (355.9.a.1). "Kill it if it has 3 Might or less" is a condition checked on resolution, not
 *    part of the target description. Contrast Gust, where "with 3 Might or less" describes the target and
 *    IS a targeting restriction (355.9.b).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LACERATE = "ven-127-166";
const GUST = "ogn-169-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn; P2 has a 5-Might and a 3-Might unit at bf1. P1 holds Lacerate and Gust with mana for either. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big Bruiser" }, "big")
    .unit(P2, "bf1", { might: 3, name: "Small Fry" }, "small")
    .hand(P1, LACERATE, "lacerate")
    .hand(P1, GUST, "gust");
}

function targetChoices(game: Game, alias: string): string[] {
  const f = game.p1.option("cast", alias)?.fields.find((x) => x.name === "targets");
  return (f?.options ?? []).flatMap((v) => (Array.isArray(v) ? (v as string[]) : [v as string])).sort();
}

describe("Ruling 272f1092ac8ca57e — Lacerate may choose a unit of any Might; the 3-or-less check is on resolution", () => {
  test.failing("BUG: ruling 272f1092ac8ca57e — Lacerate's legal targets are ALL units regardless of Might (both the 5-Might and the 3-Might unit); engine offers no target at all (effect unimplemented)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "lacerate")).toBe(true);
    expect(targetChoices(game, "lacerate")).toEqual(["big", "small"]);
  });

  test.failing("BUG: ruling 272f1092ac8ca57e — cast on the 5-Might unit: legal, costs 2 + [order], resolves, and the unit survives because the 'kill it if ≤3 Might' condition fails at resolution; engine rejects the target", async () => {
    const game = await board().build();
    await game.p1.cast("lacerate", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lacerate"]);
    await game.settle();
    expect(game.zoneOf("lacerate")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("small")).toBe("battlefield-bf1"); // not chosen, untouched
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: ruling 272f1092ac8ca57e — cast on the 3-Might unit: same targeting, but now the resolution check passes and it is killed; engine resolves Lacerate as a no-op", async () => {
    const game = await board().build();
    await game.p1.cast("lacerate", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("lacerate")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });

  test("contrast — Gust's 'with 3 Might or less' IS a targeting restriction: only the 3-Might unit is offered, the 5-Might one is rejected, and Gust bounces the small one", async () => {
    const game = await board().build();
    expect(targetChoices(game, "gust")).toEqual(["small"]);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "big" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("gust")).toBe("hand");
    await game.p1.cast("gust", { targets: "small" });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.state("small").owner).toBe(P2);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });
});
