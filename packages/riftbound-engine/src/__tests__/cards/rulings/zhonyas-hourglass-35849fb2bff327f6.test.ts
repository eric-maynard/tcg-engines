/**
 * Ruling 35849fb2bff327f6 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Several of my units die simultaneously in combat while I have Zhonya's in play — who decides which one is saved?
 * A: The controller of Zhonya's. Combat damage is assigned in order (attacker, then defender) but dealt simultaneously;
 *    units die together in the cleanup, so the order of assignment does not matter and Zhonya's controller picks which
 *    death it replaces. A HIDDEN Zhonya's must be flipped during the showdown — there is no window after damage.
 * Rules: 465.2 (assign, then deal simultaneously), 373 (single-use replacement vs simultaneous events: its controller
 *        chooses), 811 (hidden ⇒ Reaction while you have priority/Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P2 holds bf1 with A (2) and B (2) and has Zhonya's FACE UP in base. P1's Brute (8) attacks from base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "B" }, "b")
    .gear(P2, ZHONYAS, "zhonyas")
    .unit(P1, "base", { might: 8, name: "Brute" }, "brute");
}

/** Brute attacks; both pass Focus; P1 (attacker) assigns its 8 damage; stop at the next real prompt. */
async function combatUntilPrompt(game: Game): Promise<void> {
  await game.p1.move("brute", "bf1");
  const r = await game.settle(); // passes focus for both, takes the attacker's default damage split, deals damage
  expect(r.reason).toBe("unanswered");
}

describe("Ruling 35849fb2bff327f6 — simultaneous combat deaths: Zhonya's controller chooses which unit it saves", () => {
  test("8 combat damage kills A and B at the same moment; the engine asks P2 — Zhonya's controller, not the attacker — which death to replace, offering exactly A and B (mandatory, pick one)", async () => {
    const game = await board().build();
    await combatUntilPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    expect((d as PickD).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["a", "b"]);
    expect(game.actingSeat()).toBe(P2);
    // Neither has died yet — they die together in the cleanup, whatever order damage was assigned in.
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
  });

  test("P2 picks B: Zhonya's is killed instead, B is healed/exhausted/recalled; A dies; the Brute conquers", async () => {
    const game = await board().build();
    await combatUntilPrompt(game);
    await game.p2.pick("b");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("…or P2 picks A — genuinely P2's choice: A survives in base, B dies", async () => {
    const game = await board().build();
    await combatUntilPrompt(game);
    await game.p2.pick("a");
    await game.settle();
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
  });

  test("nuance — a HIDDEN Zhonya's at bf1 must be flipped while P2 holds Focus in the showdown; left face-down there is no window after damage: both die, no choice is offered, and the facedown card is trashed with the lost battlefield", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .facedown(P2, "bf1", ZHONYAS, "zh")
      .unit(P1, "base", { might: 8, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "zh")).toBe(true); // ← the window
    await game.p2.passFocus(); // declined it
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // never a replacement-assign pick
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
