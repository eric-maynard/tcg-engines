/**
 * Ruling 7e494071fb8a3243 — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · [3][fury] · [Action]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Flash (OGS-011 → ogs-011-024) · Spell · Chaos · [2] · [Reaction]
 *     "Move up to 2 friendly units to base." (a Reaction — the only speed legal while the chain is open)
 *
 * Q: If the unit Void Seeker targeted leaves the battlefield before it resolves (returns to base), does it still
 *    take the damage?
 * A: No. Legality of the target is re-checked on resolution; the unit is no longer "at a battlefield", so the
 *    damage instruction does nothing. You still draw 1 — do as much as you can.
 * Rules: 359.3.e.5 / 355.15 (targets re-checked at resolution, never re-aimed),
 *        359.3.e.11 (follow the instructions as far as possible).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const FLASH = "ogs-011-024";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. P2 holds bf1 with a 6-Might Warden. P1's Raider attacks it (opening a showdown, so both players may
 * play [Action] spells). P1 holds Void Seeker + [3][fury]; P2 holds Flash + [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, FLASH, "flash")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

/** Raider attacks; P1 casts Void Seeker at the Warden. */
async function seekerOnWarden(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("seeker", { targets: "warden" });
  expect(game.chain()[0]).toMatchObject({ cardId: "seeker", targets: ["warden"] });
  return game;
}

describe("Ruling 7e494071fb8a3243 — the target left the battlefield: no damage, but still draw 1", () => {
  test("P2 answers with Flash on its own Warden — the Warden goes home to base while Void Seeker waits", async () => {
    const game = await seekerOnWarden();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["warden"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("warden")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    expect(game.chain()[0]?.targets).toEqual(["warden"]); // never re-aimed
  });

  test("Void Seeker then resolves: the Warden takes NO damage (it is not at a battlefield any more) — but P1 still draws 1", async () => {
    const game = await seekerOnWarden();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["warden"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const handBefore = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Void Seeker resolves
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("warden").damage).toBe(0);
    expect(game.p1.hand()).toContain("d1");
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.violations()).toEqual([]);
  });

  test("control — nobody interferes: the Warden is still at bf1 on resolution, takes 4, and P1 draws 1 all the same", async () => {
    const game = await seekerOnWarden();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Void Seeker resolves
    expect(game.state("warden")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toContain("d1");
  });
});
