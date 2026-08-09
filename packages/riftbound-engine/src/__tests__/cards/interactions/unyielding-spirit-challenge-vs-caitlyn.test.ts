/**
 * Interaction: Unyielding Spirit (ogn-145-298) · Spell · Body · 1 + [body] · [Reaction]
 *     "Prevent all spell and ability damage this turn."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · [Action] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Caitlyn, Patrolling (ogn-068-298) · Champion Unit · 3 Might
 *     "[Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use only while I'm at a battlefield."
 *   × Challenge (ogn-128-298) · Spell · Body · 2 + [body] · [Action]
 *     "Choose a friendly unit and an enemy unit. THEY deal damage equal to their Mights to each other."
 *   with Vanguard Sergeant (ogn-219-298, 4 Might) and Mystic Poro (ogn-171-298, 2 Might).
 *
 * Rules: 417.6.a (no source named → the spell is the source: Void Seeker deals spell damage), 417.6.b.2 /
 * 417.6.b.2.a (an ability that names no other source is the source, together with the unit that created
 * it → ability damage), 417.6.b.3 (when a spell names UNITS as the source — Challenge's "They deal…" — the
 * damage is dealt by those units and NOT by the spell), 417.6.b.4 (each unit's controller is responsible
 * for its half), 417.6.c (combat damage has the units as source), 437.1.b / 437.1.b.1.b ("Prevent all
 * [source] damage" — the source filter is part of the prevention), 437.4 (fully prevented = never dealt).
 *
 * Question: P2 resolves Unyielding Spirit; P1 then aims (a) Void Seeker, (b) Caitlyn's [Exhaust], (c)
 * Challenge (Sergeant 4 v Poro 2) at P2's Mystic Poro, and (d) simply attacks it. Which get through?
 *
 * Expected: (a) spell damage → prevented, Poro 0 (P1 still draws 1). (b) ability damage → prevented, Poro 0,
 * Caitlyn still exhausted (cost paid). (c) the UNITS are the source → not spell/ability damage → Poro takes 4
 * and dies, Sergeant takes 2 and lives. (d) combat damage is unit-sourced → never prevented: Poro dies,
 * Sergeant conquers. An engine that parsed "prevent all" without the source filter would wrongly zero (c)/(d).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const VOID_SEEKER = "ogn-024-298";
const CAITLYN = "ogn-068-298";
const CHALLENGE = "ogn-128-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const MYSTIC_PORO = "ogn-171-298";

/**
 * P1's turn. bf1: P2's with Mystic Poro (2). bf2: P1's with Caitlyn (3) — she must be at a battlefield.
 * P1's base: Vanguard Sergeant (4). P1 holds Void Seeker + Challenge with exactly their costs; P2 holds
 * Unyielding Spirit with exactly its cost and answers each of P1's plays with it (so it resolves FIRST).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1, fury: 1 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", MYSTIC_PORO, "poro")
    .unit(P1, "bf2", CAITLYN, "cait")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, CHALLENGE, "ch")
    .hand(P2, UNYIELDING_SPIRIT, "us");
}

/** P1 passes priority on their own chain item; P2 responds with Unyielding Spirit (LIFO → it resolves first); drain. */
async function p2ShieldsThenResolve(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.p2.can("cast", "us")).toBe(true); // [Reaction]: legal in response on P1's turn
  await game.p2.cast("us");
  expect(game.chain().at(-1)).toMatchObject({ cardId: "us", controller: P2 });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.zoneOf("us")).toBe("trash");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
}

describe("Unyielding Spirit — which of Void Seeker / Caitlyn's [Exhaust] / Challenge / combat is 'spell or ability damage'?", () => {
  test("baseline (no Unyielding Spirit): Void Seeker's 4 kills the 2-Might Poro — so every 0 below is the prevention at work", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("(a) Void Seeker: the SPELL is the source (417.6.a) → spell damage → fully prevented: Poro takes 0 and stays; P1 still draws 1; both spells → trash", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length; // vs + ch
    await game.p1.cast("vs", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1, fury: 0 } });
    await p2ShieldsThenResolve(game);
    expect(game.state("poro").damage).toBe(0); // 437.4 — treated as never dealt
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // cast Void Seeker, drew 1 — the non-damage text still happens
    expect(game.zoneOf("vs")).toBe("trash");
  });

  test("(b) Caitlyn's '[Exhaust]: Deal damage equal to my Might' names no other source → ABILITY damage (417.6.b.2.a) → prevented: Poro takes 0; Caitlyn is still exhausted (the cost was paid)", async () => {
    const game = await board().build();
    const offered = game.p1.option("activate", "cait")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toContainEqual(["poro"]);
    await game.p1.activate("cait", undefined, { targets: "poro" });
    expect(game.state("cait").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cait", controller: P1 })]);
    await p2ShieldsThenResolve(game);
    expect(game.state("poro").damage).toBe(0);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("cait")).toMatchObject({ damage: 0, isExhausted: true, zone: "battlefield-bf2" });
  });

  test("(c) Challenge: 'THEY deal damage' makes the UNITS the source, not the spell (417.6.b.3) → NOT spell/ability damage → nothing is prevented: Poro takes 4 and dies, Sergeant takes 2 and survives in base", async () => {
    const game = await board().build();
    await game.p1.cast("ch", { targets: ["sarge", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0, fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ch", controller: P1, targets: ["sarge", "poro"] })]);
    await p2ShieldsThenResolve(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge")).toMatchObject({ damage: 2, might: 4 });
    expect(game.zoneOf("ch")).toBe("trash");
  });

  test("(c) control: Challenge WITHOUT Unyielding Spirit gives the identical result (Poro dead, Sergeant on 2 damage) — the Reaction changed nothing", async () => {
    const game = await board().build();
    await game.p1.cast("ch", { targets: ["sarge", "poro"] });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ damage: 2, zone: "base" });
    expect(game.zoneOf("us")).toBe("hand");
  });

  test("(d) ordinary COMBAT damage has the units as source (417.6.c) and is never prevented: with Unyielding Spirit resolved inside the showdown, Sergeant 4 still kills Poro 2 and P1 conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("sarge", "bf1");
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "us")).toBe(true); // Reaction with Focus in the showdown
    await game.p2.cast("us");
    await game.settle();
    expect(game.zoneOf("us")).toBe("trash"); // it DID resolve before the damage step
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("sarge")).toBe("bf1");
    expect(game.state("sarge").damage).toBe(0); // took the Poro's 2, healed at combat cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("all four in ONE turn under a single Unyielding Spirit ('this turn'): Void Seeker 0, Caitlyn 0, then Challenge kills the Poro anyway", async () => {
    const game = await board().build();
    // Void Seeker, shielded in response.
    await game.p1.cast("vs", { targets: "poro" });
    await p2ShieldsThenResolve(game);
    expect(game.state("poro").damage).toBe(0);
    // Caitlyn's ability later the same turn — the turn-long prevention still applies, no second copy needed.
    await game.p1.activate("cait", undefined, { targets: "poro" });
    await game.settle();
    expect(game.state("poro").damage).toBe(0);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    // Challenge — unit-sourced — goes straight through the same shield.
    await game.p1.cast("ch", { targets: ["sarge", "poro"] });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("sarge").damage).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
