/**
 * Ruling e6e7a2ed889010d4 — Gust (OGN-169 → ogn-169-298) · [Reaction] · Chaos · 1 · "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *   × Vayne, Hunter (OGN-035 → ogn-035-298) · 2 Might · "[Assault 3] … If an opponent controls a battlefield, I enter ready. …"
 *
 * Q: Does Assault apply when attacking an OPEN battlefield? And when attacking an occupied one, can the opponent Gust a
 *    base-2 Vayne with Assault 3 during the showdown?
 * A: Open battlefield → non-combat showdown, no attackers/defenders, Assault does not apply (Vayne is 2 → Gust-able).
 *    Occupied battlefield → Vayne is designated attacker as the showdown starts, Assault makes her 5, and Gust (≤3) cannot
 *    choose her.
 * Rules: 344.2 (non-combat showdown), 464.2 (designations), 803 (Assault is continuous while attacking), Gust's Might filter
 *        reads current Might.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VAYNE_HUNTER = "ogn-035-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const gustTargets = (game: Game): string[] => {
  const f = game.p2.option("cast", "gust")?.fields.find((x) => x.name === "targets");
  return [...new Set((f?.options ?? []).flat() as string[])];
};

/** P1's turn: Vayne (2, Assault 3) ready in base. bf1 open & empty; bf2 held by P2's Guard (4). P2: Gust + [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1")
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", VAYNE_HUNTER, "vayne")
    .hand(P2, GUST, "gust");
}

describe("Ruling e6e7a2ed889010d4 — Assault only counts as an attacker; Gust checks the Might Vayne has right now", () => {
  test("open battlefield: Vayne moves to empty bf1 → non-combat showdown, NO combat role, still 2 Might → with Focus P2 CAN Gust her back to hand", async () => {
    const game = await board().build();
    expect(game.state("vayne")).toMatchObject({ keywords: expect.arrayContaining(["Assault"]), might: 2 });
    await game.p1.move("vayne", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("vayne").combatRole).toBeNull();
    expect(game.state("vayne").might).toBe(2);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["vayne"]);
    await game.p2.cast("gust", { targets: "vayne" });
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.hand()).toContain("vayne");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // nobody left to conquer it
    expect(game.p1.points()).toBe(0);
  });

  test("occupied battlefield: Vayne moves into bf2 → designated ATTACKER at showdown start, Assault 3 applies at once (2 → 5) → Gust cannot choose her (no legal target at all here)", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf2");
    expect(game.state("vayne").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("vayne").might).toBe(5);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(gustTargets(game)).not.toContain("vayne");
    expect(game.p2.can("cast", "gust")).toBe(false); // Guard is 4, Vayne is 5 — nothing ≤ 3 at a battlefield
    const r = await game.p2.try((p) => p.cast("gust", { targets: "vayne" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("vayne")).toBe("battlefield-bf2");
  });

  test("the Assault Might counts for the whole combat: Vayne (5) beats the 4-Might Guard and conquers bf2", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf2");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no(); // "When I conquer, you may pay [1] to return me…" — decline (no energy anyway)
      await game.settle();
    }
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("vayne")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("vayne").might).toBe(2); // no longer an attacker
    expect(game.violations()).toEqual([]);
  });
});
