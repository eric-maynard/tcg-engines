/**
 * Ruling d9426a78220f024c — Safety Inspector (UNL-164 → unl-164-219) · Unit · Order · [5][order] · 3 Might
 *   "You may spend 3 XP as an additional cost to play me. When you play me, each player must kill one of their units.
 *    If you paid my additional cost, you don't kill a unit this way."
 *
 * Q: Can I play Safety Inspector to a battlefield where I have exactly one unit, and then kill THAT unit for the trigger?
 * A: Yes. Play the Inspector to a battlefield you control (choose whether to pay the 3 XP; pay [5][order] (+3 XP)). Its
 *    play trigger goes on the chain. Unpaid: you must kill one of your units — your lone unit there is a legal choice.
 *    Paid: you kill nothing; the opponent still must. Because the trigger is a chain item you don't lose the battlefield
 *    while resolving it (and the Inspector itself is standing there anyway).
 * Rules: 560 / 356 (optional additional cost), 383 (play trigger on the chain), 355.16 (each player chooses among their
 *        own units), 323.6 (control only lapses in an Open State with no unit of yours there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SAFETY_INSPECTOR = "unl-164-219";

/** P1's turn with [5][order] and 3 XP. P1 controls bf1 with exactly ONE unit (Sentry, 2); P2 holds bf2 with a Guard and keeps a Pawn home. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .xp(P1, 3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, SAFETY_INSPECTOR, "insp");
}

async function playToBf1(payOptional: boolean): Promise<Game> {
  const game = await board().build();
  expect(game.p1.units("bf1")).toEqual(["sentry"]);
  const to = game.p1.option("play", "insp")?.fields.find((f) => f.name === "location")?.options ?? [];
  expect(to).toContain("battlefield-bf1"); // a battlefield you control is a legal place to play a unit
  await game.p1.play("insp", { payOptional, to: "bf1" });
  return game;
}

describe("Ruling d9426a78220f024c — Safety Inspector onto a battlefield with your single unit, then kill that unit", () => {
  test("step 1 (unpaid): [5][order] paid, XP kept; the Inspector stands at bf1 next to the Sentry and its 'When you play me' trigger is on the chain", async () => {
    const game = await playToBf1(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("insp")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "insp", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("step 2 (unpaid): on resolution P1 MUST kill one of P1's units — the lone Sentry is offered (alongside the Inspector itself), no decline; P1 kills the Sentry", async () => {
    const game = await playToBf1(false);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["insp", "sentry"]); // P1's units only
    await game.p1.pick("sentry");
    // P2 must kill one of theirs too (their choice among guard | pawn)
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") break;
      const p2 = game.decision();
      expect(p2).toMatchObject({ kind: "pick", seat: P2 });
      expect(p2?.kind === "pick" ? p2.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["guard", "pawn"]);
      await game.p2.pick("pawn");
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    // battlefield control: never lost — the Inspector is P1's unit at bf1 throughout
    expect(game.zoneOf("insp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("paid variant: 3 XP spent as well; P1 is NOT asked to kill anything (Sentry and Inspector both stay at bf1) while P2 still must kill one of theirs", async () => {
    const game = await playToBf1(true);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    let p1Asked = false;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") break;
      const d = game.decision();
      if (d?.seat === P1) {
        p1Asked = true;
        break;
      }
      expect(d).toMatchObject({ kind: "pick", seat: P2 });
      await game.p2.pick("pawn");
    }
    expect(p1Asked).toBe(false);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.zoneOf("insp")).toBe("battlefield-bf1");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
