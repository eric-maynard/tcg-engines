/**
 * Ruling 8baca4b427bba09c — Defy (OGN-045 → ogn-045-298) · Spell · Calm · [1][calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Viktor, Innovator (OGN-117 → ogn-117-298) · 3 Might ·
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × Discipline (OGN-058 → ogn-058-298) · [2] · Reaction — the spell being countered.
 *
 * Q: If my spell is countered by Defy, does Viktor, Innovator still trigger?
 * A: No. "When you play a card" triggers require the card to finish being played, i.e. to resolve. A countered
 *    card never resolves, so it is not considered played and Viktor gives no Recruit.
 * Rules: 350.1 (a card is played once the whole play process finished), 419.4.a.1 (an effect that stops the
 *        resolution means the card was not played — its play-triggers do not fire), 425.1.b (countering clears the
 *        card from the chain). Note 419.4.b/812.1.c still count the countered card as FINALIZED for
 *        "cards played this turn" tallies such as [Legion]; only the play-TRIGGERS are lost.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const VIKTOR_INNOVATOR = "ogn-117-298";
const DISCIPLINE = "ogn-058-298";

/** P2's turn. P1 has Viktor in base, a Defender holding bf1 and Discipline + [2]; P2 attacks and holds Defy + [1][calm]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", VIKTOR_INNOVATOR, "viktor")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 8baca4b427bba09c — a countered spell was never played, so Viktor does not trigger", () => {
  test("control: uncountered, P1's off-turn Discipline resolves and Viktor makes a Recruit token in P1's base", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.findAll({ name: "Recruit" })).toHaveLength(1);
    expect(game.p1.units("base")).toHaveLength(2); // Viktor + the Recruit
  });

  test("premise: P2 answers with Defy — Discipline (cost [2], no Power) is within 'no more than [4] and no more than [rainbow]', and both spells sit on the chain", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "disc" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["disc", "defy"]);
  });

  test("ruling: Defy counters Discipline — it never resolves, so no Recruit token is made and Viktor's base is unchanged", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash"); // countered → trash, not resolved
    expect(game.findAll({ name: "Recruit" })).toEqual([]);
    expect(game.p1.units("base")).toEqual(["viktor"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("and Discipline's own effect is lost too — the Defender never gets its +2 [Might]", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "def" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("def").might).toBe(3);
  });
});
