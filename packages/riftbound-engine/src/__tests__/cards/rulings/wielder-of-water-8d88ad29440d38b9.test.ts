/**
 * Ruling 8d88ad29440d38b9 — Wielder of Water (OGN-055 → ogn-055-298) × Gust (OGN-169 → ogn-169-298)
 *
 *   Wielder of Water — Unit · Calm · 3 · 2 Might — "While I'm attacking or defending alone, I have +2 [Might]."
 *   Gust — Reaction [1]: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Does Wielder of Water get +2 when moving into an EMPTY battlefield, and can it be Gusted there?
 * A: No +2 — moving onto an empty battlefield opens a (non-combat) showdown, not a combat, so there is no Attacker/
 *    Defender designation; it stays at 2 Might and Gust can take it. Nuance: it is a passive, not a trigger; and if
 *    the opponent instead moves INTO Wielder's battlefield, combat starts, it is the lone Defender at 4 Might before
 *    anyone can act, so Gust cannot target it.
 * Rules: 340–344 (non-combat showdown on an open battlefield), 459–462 (combat designations), 367 (statics).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIELDER = "ogn-055-298";
const GUST = "ogn-169-298";

const gustTargets = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]));

describe("Ruling 8d88ad29440d38b9 — Wielder of Water onto an empty battlefield: no +2, Gust-able", () => {
  test("P1 moves Wielder onto open bf1: a NON-combat showdown opens, Wielder has no combat role and stays at 2 Might", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", WIELDER, "wielder")
      .hand(P2, GUST, "gust")
      .build();
    expect(game.state("wielder").might).toBe(2);
    await game.p1.move("wielder", "bf1");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(sd?.isCombatShowdown).not.toBe(true);
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder")).toMatchObject({ might: 2, staticMightBonus: 0 });
    expect(game.chain()).toEqual([]); // a passive, nothing triggered
  });

  test("P2 gets Focus in that showdown and Gust (≤3 Might) legally returns the 2-Might Wielder to P1's hand — P1 does not conquer", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", WIELDER, "wielder")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("wielder", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toContain("wielder");
    await game.p2.cast("gust", { targets: "wielder" });
    await game.settle();
    expect(game.zoneOf("wielder")).toBe("hand");
    expect(game.p1.hand()).toContain("wielder");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: when P2 attacks INTO Wielder's battlefield, combat starts and the lone Defender is already 4 Might before anyone can act — Gust cannot target it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WIELDER, "wielder")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .hand(P2, GUST, "gust")
      .build();
    expect(game.state("wielder").might).toBe(2);
    await game.p2.move("raider", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, isCombatShowdown: true });
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.state("wielder")).toMatchObject({ might: 4, staticMightBonus: 2 });
    expect(game.chain()).toEqual([]); // no "when I defend" trigger to respond to
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(gustTargets(game)).not.toContain("wielder");
    const r = await game.p2.try((p) => p.cast("gust", { targets: "wielder" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1");
  });
});
