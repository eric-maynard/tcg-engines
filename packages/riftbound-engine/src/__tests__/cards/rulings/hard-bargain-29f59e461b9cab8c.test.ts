/**
 * Ruling 29f59e461b9cab8c — Hard Bargain (SFD-136 → sfd-136-221) · Reaction · Chaos · [2]
 *     "[Repeat] [2] Counter a spell unless its controller pays [2]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: My spell gets Hard Bargained — does it still count as "played a spell" for Ravenbloom Student's +1?
 * A: No. A spell is only "played" once it resolves; a countered spell never resolves, so the Student's trigger
 *    condition is not met — whether you declined to pay the [2] or couldn't. Same for any counter (Defy, …).
 * Rules: 419.4.a–b (played = resolved, for play-triggers), 425.1.a–c (countered: no effect, to trash, no refund),
 *        355.10.e ("unless" — the named player may pay to avoid the effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";
const VOID_SEEKER = "ogn-024-298"; // [3]+[fury] Action — "Deal 4 to a unit at a battlefield. Draw 1."

/**
 * P1's turn. P1: Ravenbloom Student (2) in base, Void Seeker in hand, 3 + `spare` energy and one fury.
 * P2: Wall (6) at bf1; Hard Bargain + Defy in hand with [3] + [calm].
 */
function board(spare: number) {
  return scenario()
    .resources(P1, { energy: 3 + spare, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, HARD_BARGAIN, "hb")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Void Seeker at the Wall and passes; P2 answers with Hard Bargain on it; both pass until P1 is asked about the [2]. */
async function seekerThenBargain(spare: number): Promise<Game> {
  const game = await board(spare).build();
  await game.p1.cast("vs", { targets: "wall" });
  expect(game.p1.energy()).toBe(spare);
  expect(game.state("student").might).toBe(2); // play-triggers wait for resolution (419.4.a)
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "vs" });
  expect(game.p2.energy()).toBe(1);
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "hb"]);
  // Everyone passes → Hard Bargain resolves and asks Void Seeker's controller (P1) about the [2].
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  return game;
}

describe("Ruling 29f59e461b9cab8c — a Hard-Bargained spell was never 'played': Ravenbloom Student gets no +1", () => {
  test("declining to pay: P1 (the spell's controller) is ASKED about the [2], says no → Void Seeker countered to trash, Wall unhurt, no draw, and the Student stays at 2 Might (its trigger never hit the chain)", async () => {
    const game = await seekerThenBargain(2);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.energy()).toBe(2); // could pay — chooses not to
    const handBefore = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.p1.energy()).toBe(2); // nothing taken, nothing refunded
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("unable to pay (0 energy left): the spell is countered just the same and the Student stays at 2 Might", async () => {
    const game = await seekerThenBargain(0);
    const d = game.decision();
    // Either the engine asks with "yes" illegal, or it skips the unpayable question outright.
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.state("student").might).toBe(2);
  });

  test("contrast — paying the [2]: Void Seeker is NOT countered, resolves (4 to the Wall, draw 1) and NOW counts as played → the Student goes to 3 Might", async () => {
    const game = await seekerThenBargain(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    const handBefore = game.p1.hand().length;
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("wall").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("student").might).toBe(3);
  });

  test("same with Defy: a Defied Void Seeker never resolved, so the Student stays at 2 Might", async () => {
    const game = await board(0).build();
    await game.p1.cast("vs", { targets: "wall" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "vs" });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.state("student").might).toBe(2);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
  });
});
