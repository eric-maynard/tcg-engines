/**
 * Ruling 2c30553036364509 — Abandoned Hall (UNL-205 → unl-205-219) · Battlefield
 *   "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *
 * Q: My unit is at Abandoned Hall and I Flash it to base — does it still get the Hall's +1 Might?
 * A: No. Flash resolves first (the unit is now in base); only then does the Hall's "plays a spell" trigger go
 *    on the chain, and on resolution the flashed unit is not "here", so it is not a valid recipient.
 * Rules: 419.4.a (play-a-spell triggers after the spell resolves), 359.3.f.2 (targets checked on execution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const FLASH = "ogs-011-024";

function board() {
  return scenario()
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .unit(P1, "hall", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, FLASH, "flash")
    .resources(P1, { energy: 2 });
}

describe("Ruling 2c30553036364509 — a unit Flashed off Abandoned Hall does not get the Hall's +1", () => {
  test("Flash resolves BEFORE the Hall's trigger exists: the unit is in base while the Hall item is on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: "runner" });
    // Flash is on the chain; the Hall has not triggered yet (419.4.a).
    expect(game.chain().map((c) => c.cardId)).toEqual(["flash"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base");
    // Only now could the Hall trigger — and P1 controls no unit "here" any more, so whatever the engine
    // does with the trigger (drop it for lack of a recipient, or offer a may with no Runner), Runner is 2.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("runner");
    }
    expect(game.state("runner").might).toBe(2);
  });

  test("sole unit flashed away: accepting the 'may' finds no unit 'here' — Runner stays at 2 Might", async () => {
    const game = await board().script(P1, ["yes"]).build();
    await game.p1.cast("flash", { targets: "runner" });
    await game.settle();
    // If the engine still asks for a recipient, Runner must not be among the options.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("runner");
      if (d.allowDecline) {
        await game.p1.decline();
      }
      await game.settle();
    }
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").might).toBe(2);
    expect(game.state("runner").mightModifier).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a second unit that STAYED at the Hall is the only legal recipient (never the flashed one)", async () => {
    const game = await board().unit(P1, "hall", { might: 3, name: "Stayer" }, "stayer").script(P1, ["yes"]).build();
    await game.p1.cast("flash", { targets: "runner" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["stayer"]);
      await game.p1.pick("stayer");
      await game.settle();
    }
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").might).toBe(2);
    expect(game.state("stayer").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
