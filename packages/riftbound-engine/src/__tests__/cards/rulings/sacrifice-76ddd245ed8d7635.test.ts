/**
 * Ruling 76ddd245ed8d7635 — Sacrifice (UNL-173 → unl-173-219) · Reaction · Order · [1]
 *   "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Glasc Mixologist (sfd-165-221) 5 Might "[Deathknell] — You may play a unit with cost no more than [3]
 *     and no more than [rainbow] from your trash, ignoring its cost."
 *
 * Q: If Sacrifice kills a friendly unit with a Deathknell, do the two effects "stack"? Can I order them?
 * A: They do not combine — they are two separate items, and the player cannot choose their order. (The
 *    ruling then claims Sacrifice's draw happens first; see the RULING-CONFLICT note below.)
 * Rules: 356 (additional cost paid while the spell is played), 808.1.d.2 (the Deathknell is noted at the
 *        death), 337.1 (pending items finalize above the item that is already there), 340.1 (LIFO),
 *        430.2 ("channel 1 rune exhausted" is the explicit exception to entering ready).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const MIXOLOGIST = "sfd-165-221";
const RECRUIT = { cardType: "unit", energyCost: 1, might: 2, name: "Recruit" };

/** P1's turn with exactly [1]: a 5-Might (so [Mighty]) Mixologist in base, Sacrifice in hand, a Recruit in the trash. */
function board() {
  return scenario().resources(P1, { energy: 1 }).unit(P1, "base", MIXOLOGIST, "mixo").hand(P1, SACRIFICE, "sac").trash(P1, RECRUIT, "recruit");
}

describe("Ruling 76ddd245ed8d7635 — Sacrifice's cost-kill and the victim's Deathknell are two separate, unordered items", () => {
  test("paying the cost kills the Mixologist at once and its Deathknell becomes its OWN chain item above Sacrifice — nothing is merged, no order prompt", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "mixo" });
    expect(game.zoneOf("mixo")).toBe("trash"); // the cost is paid up front, before anything resolves
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sac", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "mixo", controller: P1, triggered: true }),
    ]);
    expect(game.p1.hand()).toHaveLength(0); // Sacrifice has not resolved
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // the Deathknell's own "you may"
  });

  // RULING-CONFLICT: riftjudge 76ddd245ed8d7635 says Sacrifice fully resolves (draw 2, channel 1) BEFORE the
  // Deathknell resolves; CR 337.1 / 340.1 put the newly finalized Deathknell ABOVE Sacrifice on the chain, so LIFO
  // resolves the Deathknell first — and riftjudge 1b00e0caff5a4372 (Sacrifice × Ruined Rex) says exactly that.
  // Engine follows CR: the Deathknell resolves first, then Sacrifice.
  test("LIFO: the Deathknell resolves first (the Recruit is already in play while Sacrifice is still on the chain)", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "mixo" });
    await game.p1.yes(); // opt into the Deathknell — it stays on top of the chain
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac", "mixo"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the TOP item (the Deathknell) resolves first
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac"]); // only Sacrifice is left
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    await game.p1.pick("recruit");

    expect(game.zoneOf("recruit")).toBe("base"); // the Deathknell has already done its work…
    expect(game.p1.hand()).toHaveLength(0); // …while Sacrifice has not drawn yet
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("then Sacrifice resolves: draw 2 and channel 1 rune EXHAUSTED (430.2's explicit exception)", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "mixo" });
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("recruit");
    await game.settle();

    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // "channel 1 rune exhausted"
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("declining the Deathknell changes nothing about Sacrifice: still draw 2 and one exhausted rune", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "mixo" });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });
});
