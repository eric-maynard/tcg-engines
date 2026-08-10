/**
 * Ruling ad796dd95c565420 — Stupefy (OGN-095 → ogn-095-298) · Reaction [1][mind] "Give a unit -1 Might this turn, to a minimum of 1. Draw 1."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might "When you play a spell, give me +1 Might this turn."
 *   × Defy (OGN-045 → ogn-045-298) / Wind Wall (OGN-064 → ogn-064-298) / Hard Bargain (SFD-136 → sfd-136-221) — counters.
 *
 * Q: If my Stupefy gets countered, does my Ravenbloom Student still get +1?
 * A: No. A spell only counts as "played" for play-triggers once it resolves; a countered Stupefy never resolves (Defy, Wind Wall,
 *    Hard Bargain… all the same), so the Student's ability does not trigger.
 * Rules: 419.4.a / 419.4.a.1 (play-triggers fire on resolution; countered → no trigger), 425.1 (countered spell → trash, no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const HARD_BARGAIN = "sfd-136-221";

/** P1's turn. P1: Student (2) in base, Stupefy + [1][mind] (+`spare` energy). P2: Brute (4) in base and the given counter with plenty to pay. */
function board(counter: string, spare = 0) {
  return scenario()
    .resources(P1, { energy: 1 + spare, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2, chaos: 1 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, counter, "counter")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** P1 Stupefies the Brute and passes; P2 answers with its counter on the Stupefy. */
async function stupefyThenCounter(counter: string, spare = 0): Promise<Game> {
  const game = await board(counter, spare).build();
  await game.p1.cast("stupefy", { targets: "brute" });
  expect(game.state("student").might).toBe(2); // nothing yet — play-triggers wait for resolution
  expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "counter")).toBe(true);
  await game.p2.cast("counter", { targets: "stupefy" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "counter"]);
  return game;
}

function expectCounteredOutcome(game: Game): void {
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("stupefy")).toBe("trash");
  expect(game.zoneOf("counter")).toBe("trash");
  expect(game.state("brute").might).toBe(4); // no -1
  expect(game.p1.hand()).toEqual([]); // no "Draw 1"
  expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 }); // the ruling
  expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Ruling ad796dd95c565420 — a countered Stupefy was never 'played': Ravenbloom Student gets no +1", () => {
  test("control: uncountered, Stupefy resolves (Brute 4 → 3, P1 draws 1) and THEN the Student's trigger fires → 3 Might", async () => {
    const game = await board(DEFY).build();
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.state("brute").might).toBe(3);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("countered by Defy: Stupefy to trash unresolved — Brute keeps 4, no draw — and the Student stays at 2 (no trigger ever on the chain)", async () => {
    const game = await stupefyThenCounter(DEFY);
    await game.settle();
    expectCounteredOutcome(game);
    expect(game.violations()).toEqual([]);
  });

  test("countered by Wind Wall: same — Student stays at 2", async () => {
    const game = await stupefyThenCounter(WIND_WALL);
    await game.settle();
    expectCounteredOutcome(game);
  });

  test("countered by Hard Bargain (P1 is asked about the [2] and declines): same — Student stays at 2", async () => {
    const game = await stupefyThenCounter(HARD_BARGAIN, 2);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expectCounteredOutcome(game);
    expect(game.p1.energy()).toBe(2); // kept its [2], Stupefy still countered
  });
});
