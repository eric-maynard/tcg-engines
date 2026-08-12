/**
 * Ruling b11c97a9ab444c46 — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *   "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × En Garde (OGN-046 → ogn-046-298) · Spell · [1] · [Reaction] · "Give a friendly unit +1 [Might] this
 *     turn, then an additional +1 [Might] this turn if it is the only unit you control there."
 *   × Retreat (OGN-104 → ogn-104-298) · Spell · [1] · [Reaction] (what P2 stacks on top).
 *
 * Q: Does the Tree's draw happen immediately, or only after the chain resolves?
 * A: Neither. The draw is a TRIGGER put on the Chain when you choose the target (as the spell goes on the
 *    Chain), so it sits above the spell: anything played after it resolves first, then the draw, then the
 *    spell itself.
 * Rules: 383.3 (triggers are added and finalized when the event happens), 336/337 (Chain is LIFO),
 *        355.14.d / 359.2 ("when you choose me" fires at targeting, not at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const EN_GARDE = "ogn-046-298";
const RETREAT = "ogn-104-298";

/** P1 holds The Dreaming Tree with one unit there and En Garde in hand; P2 holds a Reaction of their own. */
function atTheTree() {
  return scenario()
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "tree", { might: 2, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P2, RETREAT, "retreat")
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 });
}

async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling b11c97a9ab444c46 — the Tree's draw is a Chain trigger stacked above the spell that caused it", () => {
  test("choosing the friendly unit here puts the draw trigger on the Chain ABOVE the spell — and nothing is drawn yet", async () => {
    const game = await atTheTree().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("engarde", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.p1.hand().length).toBe(handBefore - 1); // only En Garde left the hand
    expect(game.state("dreamer").might).toBe(2); // the spell has not resolved
  });

  test("the trigger resolves BEFORE the spell: draw first, then the +1/+1", async () => {
    const game = await atTheTree().build();
    await game.p1.cast("engarde", { targets: "dreamer" });
    const handAfterCast = game.p1.hand().length;
    await bothPass(game); // Tree trigger
    expect(game.p1.hand().length).toBe(handAfterCast + 1);
    expect(game.state("dreamer").might).toBe(2); // still not the spell
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    await bothPass(game); // En Garde
    expect(game.state("dreamer").might).toBe(4); // +1, +1 for being alone here
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("anything placed on the Chain AFTER the trigger resolves before it", async () => {
    const game = await atTheTree().build();
    await game.p1.cast("engarde", { targets: "dreamer" });
    const handAfterCast = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "sentry" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree", "retreat"]);
    await bothPass(game); // Retreat — the newest item
    expect(game.zoneOf("sentry")).toBe("hand");
    expect(game.p1.hand().length).toBe(handAfterCast); // the Tree has still not drawn
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
    await bothPass(game); // now the Tree
    expect(game.p1.hand().length).toBe(handAfterCast + 1);
    await bothPass(game); // finally the spell
    expect(game.state("dreamer").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("it is once per turn — a second spell choosing the same unit this turn adds no further trigger", async () => {
    const game = await atTheTree().resources(P1, { energy: 2 }).hand(P1, EN_GARDE, "engarde2").build();
    await game.p1.cast("engarde", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
    await bothPass(game);
    await bothPass(game);
    await game.p1.cast("engarde2", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde2"]);
  });
});
