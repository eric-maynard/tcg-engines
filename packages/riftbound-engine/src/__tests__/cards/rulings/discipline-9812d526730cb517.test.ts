/**
 * Ruling 9812d526730cb517 — Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: I Discipline in response to Void Seeker; Discipline resolves and draws me a second Discipline. Can I play that one too before
 *    Void Seeker resolves?
 * A: Yes. After each chain item resolves, priority comes round again before the next item resolves: the owner of the next item
 *    (Void Seeker's controller) gets priority first; if they pass, you may play the freshly drawn Discipline on top of Void Seeker.
 * Rules: 340 (LIFO, one item at a time), 336–338 (priority passes around again after each resolution before the next item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with [3][fury]. P1's 2-Might Adept holds bf1; P1 has one Discipline in hand, ANOTHER on top of the deck, and [4]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Adept" }, "adept")
    .hand(P1, DISCIPLINE, "disc1")
    .deck(P1, [DISCIPLINE, "ogn-175-298"], ["disc2", "d2"])
    .hand(P2, VOID_SEEKER, "seeker");
}

/** Void Seeker at the Adept; P1 responds with Discipline #1; both pass → Discipline #1 resolves (Adept 4, P1 draws disc2). Void Seeker still pending. */
async function firstDisciplineResolves(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("seeker", { targets: "adept" });
  await game.p2.passPriority();
  await game.p1.cast("disc1", { targets: "adept" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "disc1"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("disc1")).toBe("trash");
  expect(game.state("adept").might).toBe(4);
  expect(game.p1.hand()).toEqual(["disc2"]); // Discipline drew … another Discipline
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
  expect(game.state("adept").damage).toBe(0); // Void Seeker has NOT resolved yet
  return game;
}

describe("Ruling 9812d526730cb517 — a Discipline drawn off a Discipline can still be played before Void Seeker resolves", () => {
  test("after Discipline #1 resolves, Void Seeker does not resolve straight away: priority reopens, starting with Void Seeker's owner (P2)", async () => {
    const game = await firstDisciplineResolves();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("P2 passes → P1 gets priority and may cast the just-drawn Discipline #2 on top of Void Seeker; P2 then gets to react again", async () => {
    const game = await firstDisciplineResolves();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc2")).toBe(true);
    await game.p1.cast("disc2", { targets: "adept" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "disc2"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // opponent's window after each play
  });

  test("end to end: Discipline #2 resolves (Adept 6, P1 draws d2), THEN Void Seeker deals 4 — the 6-Might Adept survives; with only one Discipline (4 Might) it would have died", async () => {
    const game = await firstDisciplineResolves();
    await game.p2.passPriority();
    await game.p1.cast("disc2", { targets: "adept" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("adept")).toMatchObject({ damage: 4, might: 6, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.violations()).toEqual([]);

    const noSecond = await firstDisciplineResolves();
    await noSecond.settle(); // nobody plays anything else
    expect(noSecond.zoneOf("adept")).toBe("trash"); // 4 damage on a 4-Might unit
    expect(noSecond.p1.hand()).toEqual(["disc2"]);
  });
});
