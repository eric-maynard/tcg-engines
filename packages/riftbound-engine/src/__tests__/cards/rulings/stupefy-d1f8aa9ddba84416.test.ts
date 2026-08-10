/**
 * Ruling d1f8aa9ddba84416 — Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] — "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · [2] · 2 — "When you play a spell, give me +1 [Might] this turn."
 *   × Hard Bargain (SFD-136 → sfd-136-221) · Reaction · [2] · [Repeat][2] — "Counter a spell unless its controller pays [2]."
 *   (Defy ogn-045-298 is named as the other kind of counter; not needed on the board.)
 *
 * Q: Ravenbloom Student is at a battlefield; I play Stupefy but it gets Hard Bargained — does Stupefy still count as
 *    "played" so the Student gets +1?
 * A: No. A spell only counts as played once it resolves; if I don't pay the [2] Stupefy is countered, never resolves,
 *    and the Student's trigger does not fire. (If I pay, Stupefy resolves normally.)
 * Rules: 412 (Counter), "played" = resolved for spell-play triggers (FAQ #7187 / #2377), Hard Bargain's unless-pay.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const HARD_BARGAIN = "sfd-136-221";

/**
 * P1's turn. P1 holds bf1 with Ravenbloom Student (2); Stupefy in hand with [1] + [2] spare (so paying is possible).
 * P2: Brute (4) in base — Stupefy's target — and Hard Bargain with exactly [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** Stupefy at the Brute; P2 Hard Bargains it; passes until P1 is asked about the [2]. */
async function stupefyThenBargain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("stupefy", { targets: "brute" });
  expect(game.p1.energy()).toBe(2);
  expect(game.state("student").might).toBe(2); // putting Stupefy on the chain is not yet "playing" it
  expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "hb")).toBe(true);
  await game.p2.cast("hb", { targets: "stupefy" });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "hb"]);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "pay [2]?" — asked of Stupefy's controller
  return game;
}

describe("Ruling d1f8aa9ddba84416 — a Hard-Bargained Stupefy was never 'played': Ravenbloom Student gets no +1", () => {
  test("P1 declines the [2]: Stupefy is countered to the trash — Brute keeps 4 Might, no draw — and the Student stays at 2 (its trigger never appears)", async () => {
    const game = await stupefyThenBargain();
    const hand = game.p1.hand().length;
    await game.p1.no();
    let studentTriggered = false;
    for (let i = 0; i < 6; i++) {
      studentTriggered ||= game.chain().some((c) => c.cardId === "student");
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(studentTriggered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.state("brute").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — P1 pays the [2]: Stupefy is NOT countered, resolves (Brute 4 → 3, P1 draws 1), and THEN the Student's trigger fires for +1 (2 → 3)", async () => {
    const game = await stupefyThenBargain();
    const hand = game.p1.hand().length;
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("brute").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("student").might).toBe(3);
  });
});
