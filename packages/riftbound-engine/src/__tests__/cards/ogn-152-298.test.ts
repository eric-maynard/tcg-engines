/**
 * Mistfall — ogn-152-298 · Gear · Body · 3 energy
 *
 *   When you buff a friendly unit, you may pay [body] and exhaust this to ready it.
 *
 * Rules: 702.2.a (to buff = place a buff counter), 383.3.b (a "you may pay X to …"
 * at the head of a trigger's effect is that trigger's cost, paid on resolution).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-152-298";
/** Inline vanilla "Buff a unit." spell (0 cost) so only Mistfall's text is under test. */
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};

function board(body = 1, gearMeta?: { exhausted?: boolean }) {
  return scenario()
    .resources(P1, { energy: 0, power: { body } })
    .gear(P1, CARD, "mist", gearMeta)
    .unit(P1, "base", { might: 2 }, "ally", { exhausted: true })
    .unit(P2, "base", { might: 2 }, "foe", { exhausted: true })
    .hand(P1, BUFF, "buff");
}

describe("Mistfall (ogn-152-298)", () => {
  test("costs 3 energy to play; lands in base ready", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "mist").build();
    await game.p1.play("mist");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("mist")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mist").build();
    expect(poor.p1.can("play", "mist")).toBe(false);
  });

  test.failing("BUG: buffing a friendly unit asks 'you may'; yes → pay [body], exhaust Mistfall, the buffed unit is readied", async () => {
    // Expected: after paying, the buffed unit ("ally") becomes ready. Actual: [body] is paid and
    // Mistfall exhausts, but the `trigger-source` ready target resolves to nothing — ally stays exhausted.
    const game = await board().build();
    await game.p1.cast("buff", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("mist").isExhausted).toBe(true);
    expect(game.state("ally").isReady).toBe(true);
  });

  test("declining pays nothing: Mistfall stays ready, the unit stays exhausted (but buffed)", async () => {
    const game = await board().build();
    await game.p1.cast("buff", { targets: "ally" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.power("body")).toBe(1);
    expect(game.state("mist").isReady).toBe(true);
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("cannot pay without [body] power or while Mistfall is already exhausted → the unit stays exhausted", async () => {
    const noPower = await board(0).build();
    await noPower.p1.cast("buff", { targets: "ally" });
    await noPower.settle();
    if (noPower.decision()?.kind === "yes-no") {
      const t = await noPower.p1.try((p) => p.yes());
      if (t.ok) await noPower.settle();
      else { await noPower.p1.no(); await noPower.settle(); }
    }
    expect(noPower.state("ally").isExhausted).toBe(true);

    const tapped = await board(1, { exhausted: true }).build();
    await tapped.p1.cast("buff", { targets: "ally" });
    await tapped.settle();
    if (tapped.decision()?.kind === "yes-no") {
      const t = await tapped.p1.try((p) => p.yes());
      if (t.ok) await tapped.settle();
      else { await tapped.p1.no(); await tapped.settle(); }
    }
    expect(tapped.state("ally").isExhausted).toBe(true);
    expect(tapped.p1.power("body")).toBe(1);
  });

  test.failing("BUG: only when YOU buff a FRIENDLY unit: buffing an enemy unit offers nothing", async () => {
    // Expected: no trigger (the buffed unit is not friendly to Mistfall's controller).
    // Actual: the opt-in yes/no prompt is raised for any buff event.
    const game = await board().build();
    await game.p1.cast("buff", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("mist").isReady).toBe(true);
    expect(game.state("foe").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(1);
  });
});
