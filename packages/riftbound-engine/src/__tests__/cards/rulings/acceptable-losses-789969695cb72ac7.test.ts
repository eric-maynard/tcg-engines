/**
 * Ruling 789969695cb72ac7 — Acceptable Losses (OGN-179 → ogn-179-298) · Spell · Chaos · [1] · [Action]
 *     "Each player kills one of their gear."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear [2] · Gold (unl-t05) · Gear token
 *
 * Q: Do I need my own gear on the field to play Acceptable Losses?
 * A: No. The spell does not target, so nothing has to be chosen to put it on the Chain — you may play it controlling
 *    no gear at all. At resolution each player who controls gear picks one of their own to kill; a player with none
 *    simply does nothing.
 * Rules: 355.8 (only targets gate playing a spell), 355.10.e (per-player choices made at resolution are not
 *        targeting), 359.3.e.11 (follow the instruction as far as possible).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const ZHONYAS = "ogn-077-298";
const GOLD = "unl-t05";

/** P1 has [1] and NO gear; P2 controls the only gear on the board. */
function opponentOnly() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

describe("Ruling 789969695cb72ac7 — Acceptable Losses needs no gear of your own", () => {
  test("with zero friendly gear the spell is a legal play and offers no object to choose on the play", async () => {
    const game = await opponentOnly().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p1.can("cast", "al")).toBe(true);
    const targets = game.p1.option("cast", "al")?.fields.find((f) => f.arg === "targets");
    expect(targets === undefined || targets.max === 0).toBe(true); // it does not target
    await game.p1.cast("al");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1, targets: [] })]);
  });

  test("ruling 789969695cb72ac7 — it resolves: the opponent's gear dies, the gearless caster loses nothing", async () => {
    const game = await opponentOnly().build();
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("p1body")).toBe("base"); // units are not gear
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("each player kills one of THEIR OWN — P2 with two gear is the one who chooses, and P1's single gear goes without a prompt", async () => {
    const game = await opponentOnly().gear(P1, ZHONYAS, "mine").gear(P2, GOLD, "gold").build();
    await game.p1.cast("al");
    await game.settle(); // stops on P2's unscripted choice among their two
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["gold", "zh"]);
    await game.p2.pick("zh");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash"); // P1's only gear, no choice offered
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("gold")).toBe("base"); // the one P2 kept
    expect(game.violations()).toEqual([]);
  });

  test("nobody has gear at all: still playable, and it simply resolves doing nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
      .hand(P1, ACCEPTABLE_LOSSES, "al")
      .build();
    expect(game.p1.can("cast", "al")).toBe(true);
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("p2body")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
