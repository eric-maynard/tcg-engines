/**
 * Fae Porter — sfd-125-221 · Unit · Chaos · 4 energy · 4 Might
 *
 *   When I move to a battlefield, you may pay [chaos] to move a unit you control
 *   to the same battlefield.
 *
 * Rules: 355.4 (a stated destination is not a choice — "the same battlefield" is the
 * battlefield Fae Porter moved to), 356.2 (the [chaos] is an optional cost on the trigger).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-125-221";

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .resources(P1, { power: { chaos: 1 } })
    .unit(P1, "base", CARD, "porter")
    .unit(P1, "base", { might: 2 }, "friend");
}

describe("Fae Porter (sfd-125-221)", () => {
  test("paying [chaos] moves the chosen friendly unit to the SAME battlefield Fae Porter moved to", async () => {
    const game = await board().build();
    await game.p1.move("porter", "bf1");
    await game.settle();
    // the trigger asks whether to pay, then which friendly unit to bring along
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("friend");
    await game.settle();
    expect(game.locationOf("porter")).toBe("bf1");
    // rule 355.4 — "the same battlefield" is Fae Porter's destination, never bf2
    expect(game.locationOf("friend")).toBe("bf1");
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("declining the [chaos] leaves the other unit where it was", async () => {
    const game = await board().build();
    await game.p1.move("porter", "bf1");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.locationOf("porter")).toBe("bf1");
    expect(game.locationOf("friend")).toBe("base");
    expect(game.p1.power("chaos")).toBe(1);
  });
});
