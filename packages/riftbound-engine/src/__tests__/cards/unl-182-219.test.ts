/**
 * Curtain Call — unl-182-219 · Spell · Fury/Mind · [4] · Action
 *
 *   [Repeat] — [1] / [rainbow] / [1][rainbow]
 *   Choose one you haven't already chosen —
 *     Draw 1. · Deal 2 to a unit at a battlefield. · Deal 3 to a unit at a base.
 *     Give a unit at a battlefield -4 [Might] this turn.
 *
 * Rule 820.2: every paid Repeat is a separate execution of the effect — a mode
 * that has to prompt for its own target must not swallow the executions that
 * still have to happen after it.
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-182-219";

/** Two battlefield units so "Deal 2 to a unit at a battlefield" must prompt. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "bf1", { might: 6 }, "foeA")
    .unit(P2, "bf1", { might: 6 }, "foeB")
    .hand(P1, CARD, "cc");
}

describe("Curtain Call (unl-182-219) — Repeat executions survive a target prompt", () => {
  test("a mode that prompts for its target still leaves the remaining Repeat execution to be chosen (820.2)", async () => {
    const game = await board().build();
    await game.p1.cast("cc", { repeat: 1 }); // two executions
    const menus: number[][] = [];
    for (let i = 0; i < 20; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") break;
      const d = game.decision() as Decision;
      if (d.kind !== "pick" || d.seat !== P1) break;
      const modes = d.options.filter((o) => o.mode !== undefined).map((o) => o.mode as number);
      if (modes.length > 0) {
        menus.push(modes);
        // First execution: "Deal 2 to a unit at a battlefield" (needs a target
        // prompt). Second execution: "Draw 1" (no target).
        const want = menus.length === 1 ? 1 : 0;
        const key = d.options.find((o) => o.mode === want)?.key as string;
        await game.p1.answer({ keys: [key], kind: "pick" });
        continue;
      }
      const opt = d.options.find((o) => o.card === "foeA") ?? d.options[0];
      await game.p1.answer({ keys: [opt?.key as string], kind: "pick" });
    }
    // Both executions happened: the damage AND the draw.
    expect(menus).toHaveLength(2);
    expect(game.state("foeA").damage).toBe(2);
    expect(game.state("foeB").damage ?? 0).toBe(0);
    expect(game.p1.hand()).toHaveLength(1);
  });
});
