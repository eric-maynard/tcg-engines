/**
 * Trusty Ramhound (sfd-159-221) — Unit, Order, 2 energy, 2 Might.
 * "While you have another unit here, I have +1 [Might]."
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-159-221";

describe("Trusty Ramhound (sfd-159-221)", () => {
  test("gets no bonus while it is the only friendly unit at its location", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, CARD, "ram")
      .build();
    await game.p1.play("ram", { to: "base" });
    await game.settle();
    expect(game.state("ram").might).toBe(2);
  });

  test("gets +1 Might while another friendly unit is here", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 3 }, "ally")
      .hand(P1, CARD, "ram")
      .build();
    await game.p1.play("ram", { to: "base" });
    await game.settle();
    expect(game.state("ram").might).toBe(3);
  });

  // rule 445.2 — "here" is the source's own location, so a friendly unit
  // somewhere else on the board does not switch the bonus on.
  test("a friendly unit at another location does not turn the bonus on", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .resources(P1, { energy: 2 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .hand(P1, CARD, "ram")
      .build();
    await game.p1.play("ram", { to: "base" });
    await game.settle();
    expect(game.state("ram").might).toBe(2);
  });
});
