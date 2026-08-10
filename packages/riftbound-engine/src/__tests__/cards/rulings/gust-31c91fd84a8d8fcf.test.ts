/**
 * Ruling 31c91fd84a8d8fcf — Gust (ogn-169-298) × Ravenbloom Student (ogn-103-298)
 *   Gust: "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand." (1, Chaos)
 *   Ravenbloom Student: 2 Might, "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: If I Gust my own Ravenbloom Student (currently 3 Might), does its trigger pump it before Gust resolves?
 * A: No. A card isn't "played" until it resolves; Gust resolves first and returns the Student to hand, and
 *    since the Student is no longer on the board its ability never triggers.
 * Rules: 350.1 / 419.4.a (played = play completed by resolution), triggers only function on the board.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

describe("Ruling 31c91fd84a8d8fcf — Gust on your own 3-Might Ravenbloom Student: no pump, it just goes to hand", () => {
  test("casting Gust puts only Gust on the chain — the Student's 'when you play a spell' has NOT triggered yet and it is still 3 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student", { buffed: true }) // 2 + buff = 3 "current Might"
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, GUST, "gust")
      .build();
    expect(game.state("student").might).toBe(3);
    // The Student (3 Might, at a battlefield) is a legal Gust target.
    expect(game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["student"]);

    await game.p1.cast("gust", { targets: "student" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
    expect(game.chain().some((c) => c.triggered)).toBe(false);
    expect(game.state("student").might).toBe(3); // no +1: nothing has been "played" yet

    await game.settle();
    // Gust resolved first: the Student is in its owner's hand, and no trigger was ever put on the chain.
    expect(game.zoneOf("student")).toBe("hand");
    expect(game.p1.hand()).toContain("student");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Back in hand it is a plain 2-Might card again (buff and any would-be pump are gone).
    expect(game.state("student").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("control: a Student that STAYS on the board does get +1 when a spell you play resolves (Gust aimed at another unit)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student", { buffed: true })
      .unit(P1, "bf1", { might: 1, name: "Decoy" }, "decoy")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.cast("gust", { targets: "decoy" });
    expect(game.state("student").might).toBe(3); // still nothing until Gust resolves
    await game.settle();
    expect(game.zoneOf("decoy")).toBe("hand");
    expect(game.locationOf("student")).toBe("bf1");
    expect(game.state("student").might).toBe(4);
  });
});
