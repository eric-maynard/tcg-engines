/**
 * Ruling 207635a19355d249 — Consult the Past (OGN-083 → ogn-083-298) [Reaction] · 4 "Draw 2."
 *   × Discipline (OGN-058 → ogn-058-298) [Reaction] · 2 "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Can you play a card while the chain is in the middle of resolving?
 * A: Yes. After EACH item resolves, players get priority again and may add Reactions before the next item resolves;
 *    new items go on top and resolve first. Example: Consult the Past (2) resolves and draws Discipline — its controller
 *    may play that Discipline before Consult the Past (1) resolves.
 * Rules: 340.4 (chain not empty, no pending items → newest item's controller gains Priority), 338/339 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSULT_THE_PAST = "ogn-083-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn, 10 energy; two Consults in hand; deck top→: Discipline, A, B, C; a 2-Might Pupil in base to Discipline. */
function board() {
  return scenario()
    .resources(P1, { energy: 10 })
    .unit(P1, "base", { might: 2, name: "Pupil" }, "pupil")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, CONSULT_THE_PAST, "ctp1")
    .hand(P1, CONSULT_THE_PAST, "ctp2")
    .deck(P1, [DISCIPLINE, "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["disc", "a", "b", "c"]);
}

/** ctp1, then ctp2 in response; both pass → ctp2 (top) resolves, drawing Discipline + A. Leaves ctp1 on the chain. */
async function twoConsultsResolveTop(game: Game): Promise<void> {
  await game.p1.cast("ctp1");
  await game.p1.cast("ctp2");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1", "ctp2"]);
  expect(game.p1.energy()).toBe(2);
  await game.p1.passPriority();
  await game.p2.passPriority(); // → ctp2 resolves
  expect(game.zoneOf("ctp2")).toBe("trash");
  expect(game.p1.hand().sort()).toEqual(["a", "disc"]);
}

describe("Ruling 207635a19355d249 — priority reopens after each chain item resolves", () => {
  test("after Consult the Past (2) resolves, Consult the Past (1) is still waiting and P1 (its controller) holds priority in a chain window — not the main phase", async () => {
    const game = await board().build();
    await twoConsultsResolveTop(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P1 may play the just-drawn Discipline NOW: it goes on top of Consult the Past (1) …", async () => {
    const game = await board().build();
    await twoConsultsResolveTop(game);
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "pupil" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1", "disc"]);
    expect(game.p1.energy()).toBe(0);
  });

  test("… and resolves BEFORE it: Discipline (Pupil +2, draw B) first with Consult (1) still on the chain, then Consult (1) draws C + a filler", async () => {
    const game = await board().build();
    await twoConsultsResolveTop(game);
    await game.p1.cast("disc", { targets: "pupil" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // → Discipline resolves
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("pupil").might).toBe(4);
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1"]); // still waiting
    // Again a priority window (P2 could respond too); both pass → Consult (1) resolves.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.zoneOf("ctp1")).toBe("trash");
    expect(game.p1.hand()).toContain("c");
    expect(game.p1.hand()).toHaveLength(4); // a, b, c + one filler
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the opponent gets the same window: after Consult (2) resolves and P1 passes, P2 has priority with Consult (1) still unresolved", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "p2disc").build();
    await twoConsultsResolveTop(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1"]);
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    await game.p2.cast("p2disc", { targets: "onlooker" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctp1", "p2disc"]);
  });
});
