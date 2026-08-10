/**
 * Ruling dec9dd67bf71be99 — Tideturner (OGN-199 → ogn-199-298) · [Hidden] "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) — the contrasting replacement effect ("kill this instead … recall it").
 *
 * Q: Hidden Blade is played FROM HIDDEN at a unit; Tideturner swaps that unit away. Can the Blade switch to Tideturner? What
 *    happens to the original target?
 * A: No retarget. The Blade still resolves (not countered) but whiffs: a hidden-played spell only affects its own battlefield and
 *    the target is no longer there — the target survives and nobody draws. (Contrast Zhonya's: a replacement keeps the target
 *    legal, so the controller still draws 2.)
 * Rules: 811.1.d.2 (hidden-play "here" restriction), 355.7 / 359.3.e (target legality re-checked at resolution), 372 (Zhonya's).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn 3. P1 controls bf1 (Holder 4) with Hidden Blade facedown there. P2 controls bf2 (Guard 1) with Tideturner facedown
 * there and attacks bf1 with Victim (3) from base. P2's deck top is known so draws are observable.
 */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
    .facedown(P2, "bf2", TIDETURNER, "tt")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** Victim attacks bf1; P2 passes Focus; P1 flips Hidden Blade at Victim and passes priority to P2. */
async function bladeOnVictim(opts: { zhonyas?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move("victim", "bf1");
  expect(game.state("victim").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.reveal("blade");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["holder", "victim"]); // only units HERE
    await game.p1.pick("victim");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 flips Tideturner at bf2, opts in and names Victim; both pass so the swap (LIFO) resolves, leaving the Blade pending. */
async function swapVictimAway(game: Game): Promise<void> {
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("victim");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tt"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("tt")).toBe("bf1");
  expect(game.locationOf("victim")).toBe("bf2");
}

describe("Ruling dec9dd67bf71be99 — hidden-played Hidden Blade whiffs after Tideturner swaps its target away", () => {
  test("after the swap the Blade is still on the chain locked on Victim — no prompt lets P1 re-aim it at Tideturner", async () => {
    const game = await bladeOnVictim();
    await swapVictimAway(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" }); // plain priority, not a pick / new-choices dialog
    expect(d?.kind === "pick").toBe(false);
  });

  test("the Blade then RESOLVES (goes to trash, not countered) but does nothing: Victim survives at bf2, Tideturner survives at bf1, P2 draws nothing", async () => {
    const game = await bladeOnVictim();
    await swapVictimAway(game);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast (Zhonya's): with no swap but a Zhonya's Hourglass out, the target is legal at resolution — Zhonya's dies instead, Victim is recalled alive, and P2 STILL draws 2", async () => {
    const game = await bladeOnVictim({ zhonyas: true });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
