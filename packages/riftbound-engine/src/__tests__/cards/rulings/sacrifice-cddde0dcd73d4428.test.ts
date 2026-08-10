/**
 * Ruling cddde0dcd73d4428 — Sacrifice (UNL-173 → unl-173-219) · Reaction · [1]
 *   "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Ruined Rex (UNL-067 → unl-067-219) · Unit · [6][mind] · 6 Might — "[Deathknell] — Deal 4 to an enemy unit."
 *   × Tactical Retreat (UNL-175 → unl-175-219) · Reaction · [2] — "Choose a friendly unit. The next time it would die
 *     this turn, heal it, exhaust it, and recall it instead."
 *
 * Q: I Tactical Retreat my Ruined Rex, then Sacrifice it — do I get everything?
 * A: Sacrifice's cost is still paid (the kill was replaced by heal/exhaust/recall — 357.2.a) so Sacrifice resolves
 *    fully (draw 2, channel 1 exhausted); Rex survives in base, healed and exhausted; its Deathknell does NOT trigger
 *    because it never actually died / went to the trash.
 * Rules: 357.2.a (replaced cost still paid), 366–372 (replacement effects), 808.1.d.1 (Deathknell needs a real death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const RUINED_REX = "unl-067-219";
const TACTICAL_RETREAT = "unl-175-219";

/** P1's turn. Rex (6, carrying 2 damage) holds bf1; P2's Big (7) in base is the only enemy unit. P1: Retreat + Sacrifice, exactly [3]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUINED_REX, "rex", { damage: 2 })
    .unit(P2, "base", { might: 7, name: "Big" }, "big")
    .hand(P1, TACTICAL_RETREAT, "tr")
    .hand(P1, SACRIFICE, "sac");
}

/** Tactical Retreat on Rex resolves; then Sacrifice is played killing Rex as its additional cost (chain: [sac]). */
async function retreatThenSacrifice(): Promise<Game> {
  const game = await board().build();
  expect(game.state("rex")).toMatchObject({ damage: 2, might: 6 }); // Mighty
  await game.p1.cast("tr", { targets: "rex" });
  await game.settle();
  expect(game.zoneOf("tr")).toBe("trash");
  expect(game.p1.energy()).toBe(1);
  // Sacrifice names Rex as the friendly Mighty unit to kill.
  expect(game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["rex"]);
  await game.p1.cast("sac", { sacrifice: "rex" });
  expect(game.p1.energy()).toBe(0);
  return game;
}

describe("Ruling cddde0dcd73d4428 — Sacrifice on a Tactically-Retreated Ruined Rex: spell resolves, Rex recalled alive, no Deathknell", () => {
  test("paying the cost: the 'kill' is replaced — Rex is healed (2 → 0 damage), exhausted and recalled to base at once, and Sacrifice is on the chain as paid", async () => {
    const game = await retreatThenSacrifice();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1 })]);
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("rex");
  });

  test("Sacrifice then resolves normally: P1 draws 2 and channels 1 rune exhausted", async () => {
    const game = await retreatThenSacrifice();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    const readyRunes = game.p1.runes({ ready: true }).length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(readyRunes); // the new rune came in exhausted
  });

  test("Deathknell never triggers: no Rex item ever appears on the chain, P1 is never asked for a Deathknell target, and Big takes no damage", async () => {
    const game = await retreatThenSacrifice();
    let rexTriggered = game.chain().some((c) => c.cardId === "rex");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      rexTriggered ||= game.chain().some((c) => c.cardId === "rex");
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(rexTriggered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("rex")).toBe("base");
  });
});
