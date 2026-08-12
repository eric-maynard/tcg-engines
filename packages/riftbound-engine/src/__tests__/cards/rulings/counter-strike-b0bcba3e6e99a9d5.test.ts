/**
 * Ruling b0bcba3e6e99a9d5 — Counter Strike (SFD-194 → sfd-194-221) · Spell · Calm/Body · [2][rainbow] · [Reaction]
 *   "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   × Void Seeker (ogn-024-298) [Action] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: Does Counter Strike block damage for the whole turn, or only one instance?
 * A: Only ONE instance. It creates a delayed replacement for "the next time"; that instance is prevented in
 *    full and the effect is then spent — any later damage the same turn lands normally. To stop two
 *    instances you need two copies, each consumed separately.
 * Rules: 437.5.b/437.7 (a "next time … prevent" delayed replacement with Prevent Value All, consumed on use).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
const VOID_SEEKER = "ogn-024-298";

/** P1's turn. P1's own 9-Might Watchtower sits at bf1 and P1 shoots it with their own Void Seekers. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { fury: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 9, name: "Watchtower" }, "tower")
    .hand(P1, COUNTER_STRIKE, "cs1")
    .hand(P1, COUNTER_STRIKE, "cs2")
    .hand(P1, VOID_SEEKER, "vs1")
    .hand(P1, VOID_SEEKER, "vs2");
}

describe("Ruling b0bcba3e6e99a9d5 — Counter Strike prevents exactly one instance of damage, not the whole turn", () => {
  test("the first instance after Counter Strike resolves is fully prevented", async () => {
    const game = await board().build();
    await game.p1.cast("cs1", { targets: "tower" });
    await game.settle();
    await game.p1.cast("vs1", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(0);
  });

  test("ruling: the SECOND instance in the same turn is dealt in full — the shield was consumed", async () => {
    const game = await board().build();
    await game.p1.cast("cs1", { targets: "tower" });
    await game.settle();
    await game.p1.cast("vs1", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(0);

    await game.p1.cast("vs2", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(4);
    expect(game.zoneOf("tower")).toBe("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P1); // still the same turn
  });

  test("ruling: two copies of Counter Strike make two separate delayed replacements — both instances are prevented", async () => {
    const game = await board().build();
    await game.p1.cast("cs1", { targets: "tower" });
    await game.settle();
    await game.p1.cast("cs2", { targets: "tower" });
    await game.settle();

    await game.p1.cast("vs1", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(0);

    await game.p1.cast("vs2", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no Counter Strike at all both Void Seekers land (4 then 8)", async () => {
    const game = await board().build();
    await game.p1.cast("vs1", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(4);
    await game.p1.cast("vs2", { targets: "tower" });
    await game.settle();
    expect(game.state("tower").damage).toBe(8);
  });

  test("Counter Strike still draws its card each time it resolves", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("cs1", { targets: "tower" });
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1);
  });
});
