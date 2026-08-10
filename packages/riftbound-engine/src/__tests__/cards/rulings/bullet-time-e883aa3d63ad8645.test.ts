/**
 * Ruling e883aa3d63ad8645 — Bullet Time (OGN-268 → ogn-268-298) · [Action] · Body/Chaos · 1 · "Pay any amount of [rainbow] to
 *     deal that much damage to all enemy units at a battlefield."
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all damaged enemy units here."
 *   × a [Deflect] unit: Pouty Poro (ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me …)"
 *
 * Q: Bullet Time + Warwick combo against a Deflect unit at the battlefield — does Deflect kick in?
 * A: No, for neither. Bullet Time chooses a BATTLEFIELD, not units; Warwick's kill affects "all damaged enemy units here"
 *    without choosing any unit. Deflect only taxes effects that choose the unit.
 * Rules: 809 (Deflect: extra [rainbow] only when an opponent CHOOSES the unit), 355.10 ("all"/criteria ≠ choosing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const WARWICK = "ogn-159-298";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn with EXACTLY [1] + 1 rainbow: Bullet Time's [1] and one [rainbow] to pay into it — nothing spare for any Deflect
 * surcharge. P2 holds bf1 with Pouty Poro (2, Deflect) and Pal (3). Warwick (5) ready in P1's base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 3, name: "Pal" }, "pal")
    .unit(P1, "base", WARWICK, "ww")
    .hand(P1, BULLET_TIME, "bt");
}

/** Bullet Time at bf1, pay 1 → 1 damage to each enemy unit there. */
async function bulletTimeForOne(): Promise<Game> {
  const game = await board().build();
  expect(game.state("poro").keywords).toContain("Deflect");
  // Bullet Time's only play-time choice is the BATTLEFIELD.
  const f = game.p1.option("cast", "bt")?.fields.find((x) => x.name === "targets");
  expect((f?.options ?? []).flat()).toEqual(["bf1"]);
  await game.p1.cast("bt", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // "Pay any amount of [rainbow]" is asked as it resolves: the full 1 is payable — no Deflect surcharge reserved.
  expect(game.decision()).toMatchObject({ kind: "integer", max: 1, min: 0, seat: P1 });
  await game.p1.chooseX(1);
  return game;
}

describe("Ruling e883aa3d63ad8645 — neither Bullet Time nor Warwick's kill 'chooses' the Deflect unit", () => {
  test("Bullet Time targets the battlefield: paying the single [rainbow] deals 1 to the Deflect Poro AND Pal — no extra [rainbow] was needed", async () => {
    const game = await bulletTimeForOne();
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("poro")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("pal")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
  });

  test("Warwick then attacks: 'kill all damaged enemy units here' kills the Deflect Poro (and Pal) with an EMPTY pool — nothing chosen, nothing to pay; Warwick conquers", async () => {
    const game = await bulletTimeForOne();
    await game.p1.move("ww", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
    expect(game.decision()?.kind).toBe("action"); // no target prompt, no pay prompt
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("ww")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
