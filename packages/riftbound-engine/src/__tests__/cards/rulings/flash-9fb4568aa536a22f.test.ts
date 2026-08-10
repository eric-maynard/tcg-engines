/**
 * Ruling 9fb4568aa536a22f — Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "Move a friendly unit and ready it." × Charm (OGN-043 → ogn-043-298) "Move an
 *     enemy unit." — both choose a destination at finalization. (Tideturner OGN-199 is cited only for its errata.)
 *   Irelia, Fervent (sfd-057-221, "When you choose or ready me, give me +1 [Might] this turn") shows the "still targeted" point.
 *
 * Q: Can you play Flash targeting a unit that is already in your base?
 * A: Yes. Flash only targets units; the destination (base) is fixed by the text, not chosen, so the play finalizes.
 *    On resolution a base→base "move" does nothing, but the unit still counts as chosen (Irelia triggers). Flash may
 *    even be cast with zero targets ("up to"). Contrast Ride the Wind / Charm, whose destination is a finalization
 *    choice and so can never name the unit's current location.
 * Rules: 355.13 ("up to N" may be 0), 355.5 (choices made at finalization), 402.4 / 140 (a move needs a different
 *        destination; base→base is no move), 383.4.b.2 (choose-triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";

type Pick = Extract<Decision, { kind: "pick" }>;
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";
const IRELIA = "sfd-057-221";

/** P1's turn. P1: Homebody (2) + Irelia (4) in base, Anchor (5) at P1's bf1; Flash, Ride the Wind, Charm in hand; plenty of resources. P2: Raider (3) at P2's bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P2, "bf2", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P1, CHARM, "charm");
}

const targetSets = (game: Game, card: string) =>
  (game.p1.option("cast", card)?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];

describe("Ruling 9fb4568aa536a22f — Flash may target a unit already in base (it resolves doing nothing to it)", () => {
  test("Flash's legal target sets include the base units (Homebody, Irelia) alone or paired, the battlefield unit, and the EMPTY set ('up to 2')", async () => {
    const game = await board().build();
    const sets = targetSets(game, "flash").map((s) => [...s].sort().join("+"));
    expect(sets).toContain(""); // zero targets
    expect(sets).toContain("home");
    expect(sets).toContain("irelia");
    expect(sets).toContain("home+irelia"); // two units both already in base
    expect(sets).toContain("anchor");
    expect(sets).not.toContain("raider"); // friendly only
    // Flash asks for no destination — there is no `to`/location field on the play.
    expect(game.p1.option("cast", "flash")?.fields.map((f) => f.name)).toEqual(["targets"]);
  });

  test("casting Flash on Homebody (in base) is legal and finalizes onto the chain with that target; on resolution Homebody is still in base, nothing moved, Flash → trash", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: ["home"] });
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["home"] })]);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("home")).toMatchObject({ isReady: true, location: "base", zone: "base" });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // base→base is not a move
    expect(game.violations()).toEqual([]);
  });

  test("the unit still counts as CHOSEN: Flashing Irelia (in base) fires her 'when you choose me' trigger — she ends 4 + 1 = 5 without going anywhere", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: ["irelia"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "flash", targets: ["irelia"] }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
    await game.settle();
    expect(game.state("irelia")).toMatchObject({ location: "base", might: 5 });
  });

  test("Flash with ZERO targets is a legal cast: it goes on the chain empty-handed and resolves to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: [] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", targets: [] })]);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p1.energy()).toBe(3);
  });

  test("mixed: Flash on [Anchor (bf1), Homebody (base)] — Anchor really moves home, Homebody just stays", async () => {
    const game = await board().build();
    const pair = targetSets(game, "flash").find((s) => [...s].sort().join("+") === "anchor+home") as string[];
    expect(pair).toBeDefined();
    await game.p1.cast("flash", { targets: pair });
    await game.settle();
    expect(game.locationOf("anchor")).toBe("base");
    expect(game.locationOf("home")).toBe("base");
  });

  test("contrast — Ride the Wind on Homebody (base): its destination is a finalization CHOICE and offers only the battlefields, never 'base' (its current location)", async () => {
    const game = await board().build();
    await game.p1.cast("ride", { targets: "home" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    const dests = (d as Pick).options.map((o) => o.key).sort();
    expect(dests).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect(dests).not.toContain("base");
  });

  test("contrast — Charm on the enemy Raider (bf2): the destination choice never offers bf2 itself", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "charm")).toBe(true);
    await game.p1.cast("charm", { targets: "raider" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const dests = (d as Pick).options.map((o) => o.key);
    expect(dests).not.toContain("battlefield-bf2");
    expect(dests.length).toBeGreaterThan(0);
  });
});
