/**
 * Ruling 10ad2c86b578aaf2 — Irelia, Fervent (SFD-057 → sfd-057-221) · Champion Unit · Calm · [5] · 4 Might
 *   "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Pit Rookie (OGN-136 → ogn-136-298) · Unit · Body · [2] · 2 Might "When you play me, buff another
 *     friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)"
 *
 * Q: Can I target an already-buffed Irelia with Pit Rookie to get her +1, even though she can't be
 *    buffed again?
 * A: Yes. A buffed unit is still a legal choice for a "buff" instruction (426.1.c) — it just receives no
 *    second buff. Choosing her is enough to trigger "when you choose me": she gets +1 [Might] this turn
 *    while keeping exactly one buff.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const PIT_ROOKIE = "ogn-136-298";

/** P1's turn: Irelia (buffed or not) + a vanilla Bystander in base so the buff target is a real choice; Pit Rookie in hand, [2]. */
function board(opts: { buffed: boolean }) {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", IRELIA, "irelia", opts.buffed ? { buffed: true } : undefined)
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, PIT_ROOKIE, "rookie");
}

/** Play Pit Rookie and answer its "buff another friendly unit" choice with Irelia; asserts Irelia is OFFERED. */
async function rookieChoosesIrelia(game: Game): Promise<void> {
  await game.p1.play("rookie");
  let chose = false;
  for (let i = 0; i < 10; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    expect(d.seat).toBe(P1);
    if (d.kind === "pick" && !chose) {
      const keys = d.options.map((o) => o.card ?? o.key);
      expect(keys).toContain("irelia"); // a buffed unit is still a legal choice (426.1.c)
      expect(keys).toContain("bystander");
      expect(keys).not.toContain("rookie"); // "another"
      const opt = d.options.find((o) => (o.card ?? o.key) === "irelia");
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
      chose = true;
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.p1.pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  expect(chose).toBe(true);
  await game.settle();
}

describe("Ruling 10ad2c86b578aaf2 — Pit Rookie choosing an already-buffed Irelia still triggers her +1", () => {
  test("baseline: unbuffed Irelia chosen by Pit Rookie gets the buff (+1) AND her choose-trigger (+1) → 6, buffed", async () => {
    const game = await board({ buffed: false }).build();
    expect(game.state("irelia")).toMatchObject({ isBuffed: false, might: 4 });
    await rookieChoosesIrelia(game);
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("irelia").isBuffed).toBe(true);
    expect(game.state("irelia").might).toBe(6);
    expect(game.chain()).toEqual([]);
  });

  test("already-buffed Irelia (5) is offered as Pit Rookie's target; choosing her adds no second buff but fires her trigger → 6", async () => {
    const game = await board({ buffed: true }).build();
    expect(game.state("irelia")).toMatchObject({ isBuffed: true, might: 5 });
    await rookieChoosesIrelia(game);
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("irelia").isBuffed).toBe(true); // still exactly one buff
    expect(game.state("irelia").mightModifier).toBe(1); // "+1 [Might] this turn" from being chosen
    expect(game.state("irelia").might).toBe(6); // 4 + 1 (buff) + 1 (chosen) — not 7 (no double buff), not 5 (trigger did fire)
    expect(game.state("bystander")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the +1 from being chosen lasts only this turn; the buff persists", async () => {
    const game = await board({ buffed: true }).build();
    await rookieChoosesIrelia(game);
    expect(game.state("irelia").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("irelia")).toMatchObject({ isBuffed: true, might: 5, mightModifier: 0 });
  });
});
