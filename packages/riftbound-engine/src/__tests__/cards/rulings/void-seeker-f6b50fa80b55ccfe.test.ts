/**
 * Ruling f6b50fa80b55ccfe — Void Seeker (OGN-024 → ogn-024-298) · Fury Action · [3][fury]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might (tag Darius; the ruling names his region tag "Noxus",
 *     which our card data does not carry — the named tag here is "Darius", the mechanics are identical)
 *   × The List (UNL-138 → unl-138-219) · Gear · [1] — "As you play this, name a tag. [Exhaust]: Give a unit with the
 *     named tag -2 [Might] this turn."
 *
 * Q: Void Seeker Darius (5 Might, 4 damage), then exhaust The List (naming his tag) on him — does he die?
 * A: Yes. Damage stays marked; The List drops his Might to 3; at the next Cleanup 4 damage ≥ 3 Might kills him.
 *    Reducing Might never heals damage; the order of damage vs. reduction does not matter.
 * Rules: 141.2 (damage is marked), 142.2.a / 322.4 (dies when marked damage ≥ current Might at a Cleanup), 762 (name a tag).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const DARIUS = "ogn-027-298";
const THE_LIST = "unl-138-219";
const FILLER = "ogn-175-298";

/** P1's turn: [4] + 1 fury, The List and Void Seeker in hand. P2's Darius (5) stands at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DARIUS, "darius")
    .hand(P1, THE_LIST, "list")
    .hand(P1, VOID_SEEKER, "seeker")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

/** Play The List naming "Darius". */
async function listNamingDarius(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("list");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  const d = game.decision();
  expect(d?.kind === "name" ? d.vocabulary : []).toContain("Darius");
  await game.p1.name("Darius");
  await game.settle();
  expect(game.state("list")).toMatchObject({ isReady: true, zone: "base" });
  expect(game.state("list").meta.namedTag).toBe("Darius");
  return game;
}

/** …then Void Seeker on Darius resolves. */
async function seekerOnDarius(): Promise<Game> {
  const game = await listNamingDarius();
  await game.p1.cast("seeker", { targets: "darius" });
  await game.settle();
  return game;
}

describe("Ruling f6b50fa80b55ccfe — 4 marked damage + The List's -2 Might kills a 5-Might Darius at the next Cleanup", () => {
  test("Void Seeker: Darius takes 4 and SURVIVES (4 < 5) with the damage marked; P1 draws 1", async () => {
    const game = await seekerOnDarius();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("darius")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("The List's [Exhaust] offers Darius (he carries the named tag); it resolves: Might 5 → 3 while 4 damage stays marked → he dies in the Cleanup", async () => {
    const game = await seekerOnDarius();
    const targets = (game.p1.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["darius"]);
    await game.p1.activate("list", undefined, { targets: "darius" });
    expect(game.state("list").isExhausted).toBe(true);
    // While the ability waits on the chain nothing has changed yet.
    expect(game.state("darius")).toMatchObject({ damage: 4, might: 5 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("order does not matter: The List first (Darius 3 Might, undamaged, alive), THEN Void Seeker's 4 ≥ 3 kills him", async () => {
    const game = await listNamingDarius();
    await game.p1.activate("list", undefined, { targets: "darius" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    await game.p1.cast("seeker", { targets: "darius" });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("contrast: Void Seeker alone (no Might reduction) leaves Darius alive at 5 Might with 4 damage until end of turn heals it", async () => {
    const game = await seekerOnDarius();
    expect(game.state("darius")).toMatchObject({ damage: 4, might: 5 });
    await game.advanceTurn();
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
  });
});
