/**
 * Ruling e1bffda8cdcc71d6 — Cleave (OGN-004 → ogn-004-298) · [Action] · Fury · 1 · "Give a unit [Assault 3] this turn."
 *   × Void Seeker (OGN-024 → ogn-024-298) · [Action] · 3 + [fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Kai'Sa, Survivor (ogn-039-298, 4 Might) as "Kaisa".
 *
 * Q: Cleaved Kai'Sa moves to an EMPTY battlefield and gets Void Seekered there — does she have +3 from Assault as an
 *    attacker (and lose it after conquering)?
 * A: No. Moving to an empty battlefield is a NON-COMBAT showdown: no attacker/defender designations, so Assault never
 *    applies. Void Seeker's 4 lands against her base Might; she dies if that is lethal (4 ≥ 4) and never conquers.
 * Rules: 344.2 (non-combat showdown), 464.2 (designations only in combat), 803 (Assault: "+N while I'm an attacker"),
 *        190.3.a (you "contest" an open battlefield, you don't attack it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const VOID_SEEKER = "ogn-024-298";
const KAISA_SURVIVOR = "ogn-039-298";

/** P1's turn: Kai'Sa (4) in base, Cleave + [1]. bf1 open and empty; bf2 held by P2's Guard (3). P2: Void Seeker + 3 + [fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1")
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, VOID_SEEKER, "vs");
}

async function cleaved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "kaisa" });
  await game.settle();
  expect(game.state("kaisa").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("kaisa").might).toBe(4); // Assault is conditional on being an attacker
  return game;
}

describe("Ruling e1bffda8cdcc71d6 — Assault does nothing when 'contesting' an empty battlefield; Void Seeker hits base Might", () => {
  test("Kai'Sa moves to EMPTY bf1: a non-combat showdown opens (bf1 contested by P1), she has NO combat role and still 4 Might", async () => {
    const game = await cleaved();
    await game.p1.move("kaisa", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("kaisa").combatRole).toBeNull();
    expect(game.state("kaisa").might).toBe(4);
    expect(game.p1.points()).toBe(0); // nothing conquered yet either
  });

  test("P2 takes Focus and Void Seekers her: 4 damage vs 4 Might is lethal — Kai'Sa dies, P2 draws 1, bf1 is never conquered and P1 scores nothing", async () => {
    const game = await cleaved();
    await game.p1.move("kaisa", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "vs")).toBe(true);
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("vs", { targets: "kaisa" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // cast one, drew one
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — moving into OCCUPIED bf2 is a combat: Kai'Sa IS the attacker, Assault 3 makes her 7, and the same Void Seeker (4) does not kill her", async () => {
    const game = await cleaved();
    await game.p1.move("kaisa", "bf2");
    expect(game.state("kaisa")).toMatchObject({ combatRole: "attacker", might: 7 });
    await game.p1.passFocus();
    await game.p2.cast("vs", { targets: "kaisa" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("kaisa")).toMatchObject({ damage: 4, might: 7, zone: "battlefield-bf2" });
  });
});
