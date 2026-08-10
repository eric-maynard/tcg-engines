/**
 * Ruling 6e759f88b5a0e4d5 — Flash (OGS-011 → ogs-011-024) · [Reaction] · [2] "Move up to 2 friendly units to base."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield "Units can't move from here to base."
 *   (× Vilemaw unl-060-219 — used here as the lone unit standing at the Lair.)
 *
 * Q: Can Flash be played legally when my only unit is at Vilemaw's Lair, and what happens on resolution?
 * A: Yes — "up to 2" allows any number including zero, and the unit at the Lair may even be selected. Flash resolves, but
 *    the Lair forbids moving to base in any way, so the unit stays; Flash and the [2] are simply spent.
 * Rules: 355.13 ("up to N" may be zero), 359.3.e.6 (impossible instruction ignored), 522 (battlefield static applies to all moves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const VILEMAWS_LAIR = "ogn-295-298";
const VILEMAW = "unl-060-219";

/** P1's turn with exactly [2]. P1's ONLY unit — Vilemaw — stands at the live Vilemaw's Lair (or an inert one for the control). */
function board(liveLair: boolean) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: !liveLair })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "lair", VILEMAW, "vilemaw")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, FLASH, "flash");
}

describe("Ruling 6e759f88b5a0e4d5 — Flash is castable with your only unit stuck at Vilemaw's Lair; it resolves and does nothing", () => {
  test("Flash is LEGAL to play: the Lair-bound Vilemaw is offered as a target, and so is the empty ('up to' = zero) selection", async () => {
    const game = await board(true).build();
    expect(game.p1.units()).toEqual(["vilemaw"]);
    expect(game.p1.can("cast", "flash")).toBe(true);
    const field = game.p1.option("cast", "flash")?.fields.find((f) => f.name === "targets");
    const sets = (field?.options ?? []) as (readonly string[])[];
    expect(sets.some((s) => Array.isArray(s) && s.length === 1 && s[0] === "vilemaw")).toBe(true);
    expect(field?.min === 0 || sets.some((s) => Array.isArray(s) && s.length === 0)).toBe(true);
  });

  test("selecting Vilemaw: the [2] is paid, Flash resolves to trash (not countered) — but Vilemaw does NOT move; it is still at the Lair", async () => {
    const game = await board(true).build();
    await game.p1.cast("flash", { targets: "vilemaw" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1 })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.energy()).toBe(0); // resources are simply lost
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("zero targets is also a legal cast: Flash resolves with no effect and is spent", async () => {
    const game = await board(true).build();
    await game.p1.cast("flash", { targets: [] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair");
  });

  test("control: at an inert battlefield the same Flash moves Vilemaw to base", async () => {
    const game = await board(false).build();
    await game.p1.cast("flash", { targets: "vilemaw" });
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("vilemaw")).toBe("base");
  });
});
