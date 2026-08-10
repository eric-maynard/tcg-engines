/**
 * Ruling 8543060fae435fe6 — Viktor, Leader (OGN-246 → ogn-246-298)
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) × Bellows Breath (SFD-080 → sfd-080-221)
 *
 *   Viktor, Leader — Unit · Order · 4 · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   Thousand-Tailed Watcher — Unit · Mind · 7 · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   Bellows Breath — Spell · Mind · 1+[mind] · Action — "Deal 1 to up to three units at the same location."
 *
 * Q: If Viktor is killed together with two other (non-Recruit) units by Watcher's -3 + Bellows Breath,
 *    does Viktor still make 2 Recruits?
 * A: No. All three die simultaneously from the same damage event; Viktor leaves the board at the same
 *    time, so he is not on the board when the others die and his trigger never fires (383.2.c.2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-246-298";
const WATCHER = "ogn-116-298";
const BELLOWS = "sfd-080-221";

const recruits = (ids: string[]) => ids.filter((c) => c.startsWith("token-recruit-"));

/** P1's turn. P2 has Viktor + two 3-Might soldiers in base. P1 holds Watcher and Bellows Breath with plenty to pay. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", VIKTOR, "vik")
    .unit(P2, "base", { might: 3, name: "Soldier A" }, "sa")
    .unit(P2, "base", { might: 3, name: "Soldier B" }, "sb")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, BELLOWS, "bb");
}

async function playWatcher(game: Game): Promise<void> {
  await game.p1.play("watcher", { to: "base" });
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
  // Enemy units shrink to 1 Might each (min 1).
  expect(game.state("vik").might).toBe(1);
  expect(game.state("sa").might).toBe(1);
  expect(game.state("sb").might).toBe(1);
}

describe("Ruling 8543060fae435fe6 — Viktor dying simultaneously with other units makes no Recruits", () => {
  test("Watcher -3 then Bellows Breath on Viktor + both soldiers: all three die at once, Viktor's trigger never fires, no Recruit tokens", async () => {
    const game = await board().build();
    await playWatcher(game);
    await game.p1.cast("bb", { targets: ["vik", "sa", "sb"] });
    await game.settle();
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("vik")).toBe("trash");
    expect(game.zoneOf("sa")).toBe("trash");
    expect(game.zoneOf("sb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(recruits([...game.p2.base(), ...game.p1.base()])).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: Bellows Breath on only the two soldiers — Viktor stays on the board, sees both deaths and makes 2 Recruits", async () => {
    const game = await board().build();
    await playWatcher(game);
    await game.p1.cast("bb", { targets: ["sa", "sb"] });
    await game.settle();
    expect(game.zoneOf("sa")).toBe("trash");
    expect(game.zoneOf("sb")).toBe("trash");
    expect(game.zoneOf("vik")).toBe("base");
    expect(recruits(game.p2.base())).toHaveLength(2);
  });
});
