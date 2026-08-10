/**
 * Ruling 3325dcedc8e121c8 — Ravenbloom Student (OGN-103 → ogn-103-298) 2-Might unit
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) [Reaction] 1+[calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) [Reaction] 3+[calm][calm] "Counter a spell."
 *
 * Q: Does Ravenbloom Student trigger if the spell I play is countered by Defy or Wind Wall?
 * A: No. A spell counts as "played" when it resolves; a countered spell never resolves, so the Student's ability
 *    never triggers (countering prevents it from being "played" for triggered abilities generally).
 * Rules: 425.1.a/b (countered → does nothing; not "played" for play-triggers), 419.4.a.1, 359.3.e.10 (contrast: a
 *        resolving spell with no effect still counts as played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const DISCIPLINE = "ogn-058-298"; // 2, [Reaction] "Give a unit +2 [Might] this turn. Draw 1." — a cheap Defy-able spell

/** P1's turn. P1: Student (2) + vanilla Ally (2) in base, Discipline in hand, 2 energy. P2: Defy + Wind Wall, 4 energy + 3 calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "wall")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

/** P1 Disciplines the Ally and passes; P2 counters with `counter`; chain resolves out. */
async function counteredBy(game: Game, counter: "defy" | "wall"): Promise<void> {
  await game.p1.cast("disc", { targets: "ally" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]); // no Student trigger yet — nothing has been "played"
  if (game.has("student")) {
    expect(game.state("student").might).toBe(2);
  }
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast(counter, { targets: "disc" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", counter]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Ruling 3325dcedc8e121c8 — Ravenbloom Student does not trigger off a countered spell", () => {
  test("control: Discipline resolves un-countered → the Student triggers and is 3 Might this turn (Ally +2, P1 drew 1)", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.state("student").might).toBe(3);
  });

  test("Defy counters Discipline: it goes to the trash unresolved (no +2, no draw) and the Student never triggers — still 2 Might, no trigger ever hit the chain", async () => {
    const game = await board().build();
    await counteredBy(game, "defy");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Wind Wall counters Discipline: same result — the Student stays at 2 Might", async () => {
    const game = await board().build();
    await counteredBy(game, "wall");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.violations()).toEqual([]);
  });
});
