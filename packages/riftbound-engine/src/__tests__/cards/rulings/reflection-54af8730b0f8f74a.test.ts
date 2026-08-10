/**
 * Ruling 54af8730b0f8f74a — Reflection (UNL-T06 → unl-t06) · Unit token "(I become a copy of something when played. I don't
 *   get that card's play effects.)" × Atakhan (UNL-170 → unl-170-219) · Unit · Order · 10+[order]×3 · 7 "You may kill a
 *   friendly unit as an additional cost to play me. If you do, I cost [1] less for each Energy it costs and [order] less for
 *   each Power it costs. [Ganking] When I attack, the defender must kill one of their units here."
 *   (+ Mirror Image unl-200-219 to create the Reflection that copies my first Atakhan.)
 *
 * Q: My Reflection token copied Atakhan. I play a real Atakhan from hand, killing that Reflection as the additional cost —
 *    is it free?
 * A: Yes: the cost is reduced by [10] and three [order] (the killed copy's costs), i.e. to nothing.
 * Rules: 356.2–356.4 (additional cost, then reductions computed from the killed unit's current characteristics),
 *        182.1.d (tokens are units), 187 (a copy takes the copied card's cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ATAKHAN = "unl-170-219";
const MIRROR_IMAGE = "unl-200-219";

/** P1's turn: my first Atakhan already in base; Mirror Image + a second Atakhan in hand; exactly Mirror Image's [3]+2 rainbow. */
function board() {
  return scenario()
    .unit(P1, "base", ATAKHAN, "ata1")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, ATAKHAN, "ata2")
    .resources(P1, { energy: 3, power: { rainbow: 2 } });
}

/** Mirror Image my own Atakhan → a Reflection-of-Atakhan token in base. Returns its id. */
async function reflectMyAtakhan(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "ata1" });
  await game.settle();
  const token = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(token).toBeDefined();
  return token as string;
}

describe("Ruling 54af8730b0f8f74a — killing a Reflection-of-Atakhan pays for a real Atakhan in full", () => {
  test("the Reflection has become a copy of Atakhan, costs included: [10] + [order][order][order], 7 Might; P1 is left with no energy and no [order]", async () => {
    const game = await board().build();
    const refl = await reflectMyAtakhan(game);
    expect(game.state(refl)).toMatchObject({ energyCost: 10, isToken: true, might: 7, name: "Atakhan", powerCost: ["order", "order", "order"] });
    expect(game.p1.resources().energy).toBe(0);
    expect(game.p1.power("order")).toBe(0);
  });

  test("from zero resources the second Atakhan is playable — and only via the kill-a-friendly-unit additional cost; the Reflection is an offered sacrifice", async () => {
    const game = await board().build();
    const refl = await reflectMyAtakhan(game);
    expect(game.p1.can("play", "ata2")).toBe(true);
    const opt = game.p1.option("playUnit", "ata2");
    const sac = opt?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options ?? []).toContain(refl);
    expect(opt?.variants.every((v) => v.params.sacrificeId !== undefined)).toBe(true); // no unpaid variant is affordable
  });

  test("play Atakhan killing the Reflection: [10]−10 = 0 energy and 3−3 = no [order] paid; Atakhan enters base, the token ceases to exist, the original Atakhan is untouched", async () => {
    const game = await board().build();
    const refl = await reflectMyAtakhan(game);
    await game.p1.play("ata2", { sacrifice: refl });
    await game.settle();
    expect(game.zoneOf("ata2")).toBe("base");
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.zoneOf("ata1")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
  });

  test("contrast: sacrificing a unit that costs [2] and no Power only knocks [2] off — with 0 resources Atakhan stays unplayable that way", async () => {
    const game = await scenario()
      .unit(P1, "base", { energyCost: 2, might: 2, name: "Pawn" }, "pawn")
      .hand(P1, ATAKHAN, "ata2")
      .build();
    expect(game.p1.can("play", "ata2")).toBe(false);
    await game.p1.do("addResources", { energy: 8, power: { order: 3 } });
    const opt = game.p1.option("playUnit", "ata2");
    expect(opt?.variants.some((v) => v.params.sacrificeId === "pawn")).toBe(true);
    await game.p1.play("ata2", { sacrifice: "pawn" });
    await game.settle();
    expect(game.zoneOf("ata2")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // 10 − 2 = 8 energy, all 3 [order]
  });
});
