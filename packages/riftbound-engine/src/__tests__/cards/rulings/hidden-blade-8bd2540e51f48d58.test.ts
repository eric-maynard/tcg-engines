/**
 * Ruling 8bd2540e51f48d58 — Vi, Destructive (ogn-036-298) — asked under Hidden Blade (OGN-213) / Smoke Screen (OGN-093)
 *
 *   Vi, Destructive — Unit · Fury · 2+[fury] · 3 Might
 *     "[Ganking] Recycle 1 from your trash: Give me +1 [Might] this turn."
 *   Smoke Screen — Reaction [2]: "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can Vi's ability be activated multiple times (no exhaust cost)? Is recycling a card from trash mandatory?
 * A: Yes — it is an activated ability usable as many times as you like on your turn, but the cost (recycle 1 from
 *    YOUR trash) must be paid every time. Only on your turn, before showdowns (Open State); opponents can still
 *    answer with removal / Smoke Screen etc.
 * Rules: 145.2 (unit activated abilities: your Main Phase, Open State), 402/416.5 (costs must be paid in full).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";
const SMOKE_SCREEN = "ogn-093-298";
const JUNK = "ogn-175-298";
const PUMP = 1; // ability #0 is [Ganking]; #1 is the recycle-to-pump ability

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VI, "vi")
    .unit(P2, "bf1", { might: 5, name: "Holder" }, "holder")
    .trash(P1, JUNK, "j1")
    .trash(P1, JUNK, "j2")
    .trash(P1, JUNK, "j3");
}

describe("Ruling 8bd2540e51f48d58 — Vi's pump is repeatable but always costs a recycle from your own trash", () => {
  test("three activations in one turn, each recycling exactly one card from P1's trash; Vi is never exhausted and ends at 6 Might", async () => {
    const game = await board().build();
    expect(game.state("vi").might).toBe(3);
    await game.p1.activate("vi", PUMP, { params: { recycleIds: ["j1"] } });
    expect(game.p1.trash().sort()).toEqual(["j2", "j3"]); // cost paid on activation
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    await game.p1.activate("vi", PUMP, { params: { recycleIds: ["j2"] } });
    await game.settle();
    await game.p1.activate("vi", PUMP);
    await game.settle();
    expect(game.state("vi").might).toBe(6);
    expect(game.state("vi").isExhausted).toBe(false);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck().slice(-3).sort()).toEqual(["j1", "j2", "j3"]);
    expect(game.p1.energy()).toBe(0); // no resource cost
  });

  test("the recycle is mandatory: with P1's trash empty the ability is not available — cards in the OPPONENT's trash don't count", async () => {
    const game = await scenario().unit(P1, "base", VI, "vi").trash(P2, JUNK, "theirs").build();
    expect(game.p1.can("activate", "vi")).toBe(false);
    const r = await game.p1.try((p) => p.activate("vi", PUMP));
    expect(r.ok).toBe(false);
    expect(game.state("vi").might).toBe(3);
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("only on your own turn: on P2's turn P1 cannot activate it", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("activate", "vi")).toBe(false);
  });

  test("'before showdowns': once Vi has attacked and a showdown is open, the ability is no longer available even with Focus", async () => {
    const game = await board().build();
    await game.p1.activate("vi", PUMP, { params: { recycleIds: ["j1"] } });
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    await game.p1.move("vi", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "vi")).toBe(false);
    // The pump carried into combat: 4 vs 5 — Vi dies, Holder survives.
    await game.settle();
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
  });

  test("it uses the chain, so an opponent may answer it — e.g. Smoke Screen in response", async () => {
    const game = await board().resources(P2, { energy: 2, power: { mind: 1 } }).hand(P2, SMOKE_SCREEN, "smoke").build();
    await game.p1.activate("vi", PUMP, { params: { recycleIds: ["j1"] } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "smoke")).toBe(true);
  });
});
