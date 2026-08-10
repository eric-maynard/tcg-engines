/**
 * Ruling ca8ebecae25c18f7 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Several of my units die simultaneously in combat — which one does Zhonya's save? And with several Zhonya's?
 * A: The Hourglass's controller CHOOSES which death it replaces (it must already be face up at that moment). It is a
 *    mandatory replacement effect — no chain, no opting out. With multiple Zhonya's you lose one Hourglass per death
 *    prevented.
 * Rules: 370–373 (replacement effects; 373: the controller picks which of several simultaneous events a single-use
 *        replacement applies to), 465/466 (combat deaths are simultaneous), 811 (a facedown card is not in play).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with A (3) and B (2); `hourglasses` face-up Zhonya's in P1's base; P2's 8-Might Brute attacks (8 = lethal to both). */
function board(hourglasses: number) {
  const b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P1, "bf1", { might: 3, name: "Unit A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "Unit B" }, "b")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute");
  for (let i = 1; i <= hourglasses; i++) b.gear(P1, ZHONYAS, `zh${i}`);
  return b;
}

/** Brute attacks and both pass Focus; returns at the first replacement prompt (if any). */
async function bruteKillsBoth(hourglasses: number): Promise<Game> {
  const game = await board(hourglasses).build();
  await game.p2.move("brute", "bf1");
  await game.settle();
  return game;
}

/** Skip a rule-372 "which Hourglass applies first" ordering ask (identical sources — order is immaterial). */
async function passOrdering(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "replacement-order") {
    expect(d.seat).toBe(P1);
    await game.p1.pick(d.options[0]?.key as string);
    await game.settle();
  }
}

describe("Ruling ca8ebecae25c18f7 — simultaneous combat deaths: Zhonya's controller picks the death it replaces; one Hourglass per death", () => {
  test("ONE Hourglass, two units dying at once: the game stops on a choice for P1 (the Hourglass's controller, on P2's turn) — 'which death does it replace', A or B — surfaced as a replacement-assign pick, not a chain item", async () => {
    const game = await bruteKillsBoth(1);
    await passOrdering(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-assign", timing: "RPL" });
    expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["a", "b"]);
    expect(game.chain()).toEqual([]); // replacement effects don't use the chain
  });

  test("it is MANDATORY: the pick requires exactly one answer and cannot be declined", async () => {
    const game = await bruteKillsBoth(1);
    await passOrdering(game);
    const d = game.decision() as PickD;
    expect(d.allowDecline).toBe(false);
    expect([d.min, d.max]).toEqual([1, 1]);
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zh1")).toBe("base"); // nothing happened yet
  });

  test("P1 chooses A: the Hourglass is killed instead, A is healed/exhausted/recalled to base; B (unchosen) dies; the Brute conquers bf1", async () => {
    const game = await bruteKillsBoth(1);
    await passOrdering(game);
    await game.p1.pick("a");
    await game.settle();
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("TWO Hourglasses, two simultaneous deaths: one Hourglass is lost PER death prevented — both Zhonya's end in the trash and BOTH units are saved to base", async () => {
    const game = await bruteKillsBoth(2);
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) break;
      expect(["replacement-order", "replacement-assign"]).toContain(d.semantics as string);
      await game.p1.pick(d.options[0]?.key as string);
      await game.settle();
    }
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("a");
    expect(game.p1.trash()).not.toContain("b");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // nobody left defending → the Brute still conquers
    expect(game.violations()).toEqual([]);
  });

  test("'must already be face up': a Zhonya's lying FACE DOWN at bf1 replaces nothing on its own — no prompt, both units die (and the hidden card is trashed with the lost battlefield)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
      .unit(P1, "bf1", { might: 3, name: "Unit A" }, "a")
      .unit(P1, "bf1", { might: 2, name: "Unit B" }, "b")
      .facedown(P1, "bf1", ZHONYAS, "zhfd")
      .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus(); // P1 chooses NOT to flip it
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zhfd")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
