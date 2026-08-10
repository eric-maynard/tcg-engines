/**
 * Interaction: Shady Spectacles (ven-137-166, Order Gear, [Equip] [1][order]) "As this is attached to a unit, choose another
 *     friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Ruined Rex (unl-067-219, 6 Might) "[Deathknell] Deal 4 to an enemy unit."
 *   × Angle Shot (sfd-011-221, Fury Reaction spell, 2) "Choose a unit and an Equipment with the same controller. Attach that
 *     Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *   with Daring Poro (ogn-210-298, 2 Might, [Assault]) as the copy model / bearer, an inline 4-Might "Friend", P2's inline
 *   5-Might "Victim" (the lone enemy unit — a Deathknell target would be forced onto it) and P2's inline "Test Blast"
 *   (0: deal 4 to a unit).
 *
 * Question — 'becomes a copy' mid-turn with damage already marked:
 *   Case A: P1's Ruined Rex has 3 damage. P1 Equips Shady Spectacles onto Rex and, as it attaches, chooses Daring Poro.
 *     Does Rex keep its 3 damage? What is its Might, does it die, and if so does its PRINTED Deathknell (deal 4) trigger?
 *     Where do the Spectacles end up? Contrast: choose the 4-Might Friend instead.
 *   Case B (revert): P1's Daring Poro wears the Spectacles copying Ruined Rex (a 6-Might "Ruined Rex"). On P2's turn it
 *     takes 4 from Test Blast and survives. P2 then Angle-Shots P1's (Poro, Spectacles) — DETACH. What is the Poro now,
 *     does it die at the next cleanup, and does any Deathknell fire?
 *
 * Rules: 143.3 / 477.1.b.1.a (damage is a status on the object, not a copiable trait — never added/removed by a copy),
 * 476 / 477.1.b / 477.3 (Might is recalculated through the layers the moment a copy effect starts or stops), 142.4.b /
 * 143.2.a / 323.5 (damage ≥ Might is lethal; the unit is killed at the next Cleanup), 323.4 / 808.1.d.2-3 (death
 * triggers are noted with the unit's attributes at that moment — Spectacles still attached ⇒ Poro text ⇒ no Deathknell),
 * 435.1.c / 435.1.d ("for as long as attached" ends immediately on detach), 457.1 / 711 (Equipment of a dying unit stays
 * on the board unattached; the card is its printed self in the trash), 818.1.b (Angle Shot: "same controller", not
 * "friendly" — P2 may pick P1's pair).
 *
 * Expected: A — Rex becomes "Daring Poro", 2 Might, Assault only, still 3 damage → dies in the Cleanup after the Equip
 * resolves; NO Deathknell (Victim undamaged); trash holds printed Ruined Rex; Spectacles unattached in P1's base.
 * Contrast: as "Friend" it is 4 Might with 3 damage and lives (a +1-this-turn already on Rex rides on top → 5).
 * B — Angle Shot offers P1's pairs to P2; on detach the Poro reverts to printed Daring Poro, 2 Might, 4 damage → dies at
 * that Cleanup; no Deathknell of any kind (Victim undamaged); Spectacles unattached in P1's base; P2 drew 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const RUINED_REX = "unl-067-219";
const ANGLE_SHOT = "sfd-011-221";
const DARING_PORO = "ogn-210-298";

/** P2's inline damage source for Case B: 0 energy, deal 4 to a unit. */
const TEST_BLAST = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Blast",
  timing: "action",
};

/**
 * Case A — P1's turn. P1: Ruined Rex (3 damage marked; `rexMeta` may add more), Daring Poro, 4-Might Friend, unattached
 * Spectacles, exactly 1 energy + 1 order for the Equip. P2: lone 5-Might Victim in base.
 */
function boardA(rexMeta: Record<string, unknown> = {}) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .unit(P1, "base", RUINED_REX, "rex", { damage: 3, ...rexMeta })
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P1, "base", { might: 4, name: "Friend" }, "friend")
    .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
    .gear(P1, SHADY_SPECTACLES, "specs");
}

/**
 * Case B — starts on P1's turn 2 (P1 must Equip on its own turn). P1: undamaged Rex + Poro, Spectacles, 1 energy + 1 order.
 * P2: Victim, Angle Shot + Test Blast in hand (P2 taps its 2 freshly channeled runes for Angle Shot on turn 3).
 */
function boardB() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P2, ANGLE_SHOT, "angle")
    .hand(P2, TEST_BLAST, "blast");
}

/** Activate [Equip] Spectacles → `bearer`, let it resolve, and choose `model` as the unit to copy when asked. */
async function equipCopying(game: Game, bearer: string, model: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: bearer } });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(model);
    await game.settle({ policy: "first" }); // "first" would aim a (wrong) Deathknell prompt somewhere instead of stalling
  }
}

/** Case B up to "Poro-as-Rex has taken 4 on P2's turn and survived". */
async function poroAsRexBlasted(): Promise<Game> {
  const game = await boardB().build();
  await equipCopying(game, "poro", "rex");
  await game.advanceTurn(); // → P2's turn 3
  await game.p2.tapRunes(2);
  await game.p2.cast("blast", { targets: "poro" });
  await game.settle();
  return game;
}

describe("Shady Spectacles × Ruined Rex × Angle Shot — damage stays, Might is recalculated when a copy starts/stops", () => {
  // ================================================================== Case A
  test("A setup: Rex is a 6-Might 'Ruined Rex' with [Deathknell] and 3 damage; the Equip offers Rex as a bearer and then asks Poro | Friend as the model", async () => {
    const game = await boardA().build();
    expect(game.state("rex")).toMatchObject({ damage: 3, might: 6, name: "Ruined Rex" });
    expect(game.state("rex").keywords).toContain("Deathknell");
    const equip = game.p1.option("equipCard:-");
    expect(equip?.fields.find((f) => f.name === "unitId")?.options).toContain("rex");
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "rex" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["friend", "poro"]); // "another" — never Rex itself
  });

  test("A: copying Daring Poro — the 3 damage stays (143.3), Might drops 6 → 2 at once (477.3), 3 ≥ 2 is lethal → Rex is killed in the Cleanup right after the Equip resolves (142.4.b/323.5)", async () => {
    const game = await boardA().build();
    await equipCopying(game, "rex", "poro");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("A: it died as 'Daring Poro' (Assault, no Deathknell) — Ruined Rex's PRINTED 'Deal 4' does NOT trigger: the lone enemy Victim is undamaged and nothing was put on the chain (323.4/808.1.d.3)", async () => {
    const game = await boardA().build();
    await equipCopying(game, "rex", "poro");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, location: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("A aftermath: the trash holds PRINTED Ruined Rex (6, Deathknell — 711); the Spectacles detached and sit unattached in P1's base (457.1); the real Poro is untouched", async () => {
    const game = await boardA().build();
    await equipCopying(game, "rex", "poro");
    expect(game.state("rex")).toMatchObject({ baseMight: 6, name: "Ruined Rex", zone: "trash" });
    expect(game.state("rex").keywords).toContain("Deathknell");
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.p1.gear()).toContain("specs");
    expect(game.state("poro")).toMatchObject({ attachments: [], damage: 0, location: "base", might: 2, name: "Daring Poro" });
  });

  test("A contrast: copying the 4-Might Friend — 'Friend', 4 Might, still 3 damage (< 4) → survives wearing the Spectacles, and has no Deathknell while the copy lasts", async () => {
    const game = await boardA().build();
    await equipCopying(game, "rex", "friend");
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex")).toMatchObject({ attachments: ["specs"], baseMight: 4, damage: 3, might: 4, name: "Friend" });
    expect(game.state("rex").keywords).not.toContain("Deathknell");
    expect(game.state("specs").attachedTo).toBe("rex");
    expect(game.state("victim").damage).toBe(0);
  });

  test("A contrast: a +1-this-turn already on Rex rides on top of the copied base Might (layer 3 after layer 1): as 'Friend' it is 4 + 1 = 5", async () => {
    const game = await boardA({ mightModifier: 1 }).build();
    expect(game.state("rex")).toMatchObject({ might: 7, mightModifier: 1 });
    await equipCopying(game, "rex", "friend");
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex")).toMatchObject({ baseMight: 4, damage: 3, might: 5, mightModifier: 1, name: "Friend" });
  });

  // ================================================================== Case B
  test("B setup: Poro wearing the Spectacles IS 'Ruined Rex' — 6 Might, Deathknell — and stays so into P2's turn; Test Blast puts 4 on it and it survives (4 < 6)", async () => {
    const game = await boardB().build();
    await equipCopying(game, "poro", "rex");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], might: 6, name: "Ruined Rex" });
    expect(game.state("poro").keywords).toContain("Deathknell");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("poro")).toMatchObject({ might: 6, name: "Ruined Rex" }); // "for as long as attached" spans turns
    await game.p2.tapRunes(2);
    await game.p2.cast("blast", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 4, might: 6, name: "Ruined Rex" });
  });

  test("B: Angle Shot ('same controller', not 'friendly') lets P2 pick P1's pairs — (Poro, Spectacles) and (Rex, Spectacles) are offered", async () => {
    const game = await poroAsRexBlasted();
    expect(game.p2.can("cast", "angle")).toBe(true);
    const pairs = (game.p2.option("cast", "angle")?.fields.find((f) => f.name === "targets")?.options ?? [])
      .map((o) => (o as string[]).join("+"))
      .sort();
    expect(pairs).toEqual(["poro+specs", "rex+specs"]);
  });

  test("B: DETACH resolves — the copy ends immediately (435.1.c/d): printed 'Daring Poro', 2 Might, its 4 damage still marked → lethal → killed at that Cleanup; P2 drew 1", async () => {
    const game = await poroAsRexBlasted();
    const p2Hand = game.p2.hand().length; // includes Angle Shot
    await game.p2.cast("angle", { targets: ["poro", "specs"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "angle", controller: P2, targets: ["poro", "specs"] })]);
    expect(game.p2.energy()).toBe(0);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("B: no Deathknell of any kind — it no longer had Rex's text when the death was processed and printed Poro has none: the enemy Victim is undamaged, the real Rex untouched", async () => {
    const game = await poroAsRexBlasted();
    await game.p2.cast("angle", { targets: ["poro", "specs"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, location: "base", might: 5 });
    expect(game.state("rex")).toMatchObject({ damage: 0, location: "base", might: 6, name: "Ruined Rex" });
    expect(game.violations()).toEqual([]);
  });

  test("B aftermath: the Spectacles stay on the board — unattached, P1's, in P1's base (never trashed with the Poro)", async () => {
    const game = await poroAsRexBlasted();
    await game.p2.cast("angle", { targets: ["poro", "specs"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
    expect(game.p1.gear()).toContain("specs");
  });
});
