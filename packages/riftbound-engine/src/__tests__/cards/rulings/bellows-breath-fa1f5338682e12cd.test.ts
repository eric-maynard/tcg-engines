/**
 * Ruling fa1f5338682e12cd — Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] "Deal 1 to up to three units at the same location."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."   (Rengar = the targeted unit)
 *
 * Q: The enemy Bellows Breaths my Rengar at a battlefield. Does Flashing Rengar to base cancel Bellows Breath?
 * A: No. Bellows Breath targets UNITS, not a location; "same location" is a play-time restriction. The spell follows Rengar to
 *    base and he still takes 1. Nuance: if other targets stayed at the battlefield, the caster picks ONE location among where the
 *    original targets now are and only those there are hit — so Rengar dodges only if the caster picks the battlefield. A sole
 *    target is always "at the same location" as itself and is always hit.
 * Rules: 355.5 (targeting requirement checked on play), 355.11 / 355.11.b (targets tracked; group re-pick), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with Rengar (6) and Packmate (2); P2 has Flash + [2]. P1: Bellows Breath + [1][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Rengar" }, "rengar")
    .unit(P2, "bf1", { might: 2, name: "Packmate" }, "mate")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, FLASH, "flash");
}

/** Bellows at `targets` → P1 passes → P2 Flashes Rengar (only) home → both pass: Flash resolves. Bellows still pending. */
async function bellowsThenFlashRengar(targets: string[]): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bellows", { targets });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", controller: P1, targets })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["rengar"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash resolves (LIFO)
  expect(game.zoneOf("flash")).toBe("trash");
  expect(game.locationOf("rengar")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows"]);
  expect(game.state("rengar").damage).toBe(0);
  return game;
}

describe("Ruling fa1f5338682e12cd — Flash does not cancel Bellows Breath; the spell follows its target", () => {
  test("sole target: Rengar Flashed to base is still hit for 1 when Bellows Breath resolves (no location prompt — a lone target is trivially 'at the same location')", async () => {
    const game = await bellowsThenFlashRengar(["rengar"]);
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ damage: 1, location: "base" });
    expect(game.state("mate").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — targets split across locations (Rengar in base, Packmate at bf1): on resolution the CASTER (P1) is asked to choose the original targets at one location", async () => {
    const game = await bellowsThenFlashRengar(["rengar", "mate"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bellows starts resolving
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "subset" });
    expect((d as PickDecision).options.map((o) => o.card ?? o.key).sort()).toEqual(["mate", "rengar"]);
    const mixed = await game.p1.try((p) => p.pick("rengar", "mate"));
    expect(mixed.ok).toBe(false); // two locations can't both be chosen
  });

  test("nuance — caster picks the battlefield: Packmate takes 1, Rengar (in base) takes nothing — the only way Flash 'saves' him", async () => {
    const game = await bellowsThenFlashRengar(["rengar", "mate"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("mate");
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("mate").damage).toBe(1);
    expect(game.state("rengar").damage).toBe(0);
  });

  test("nuance — caster picks the base: Rengar takes 1 there and Packmate is untouched", async () => {
    const game = await bellowsThenFlashRengar(["rengar", "mate"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("rengar");
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ damage: 1, location: "base" });
    expect(game.state("mate").damage).toBe(0);
  });
});
