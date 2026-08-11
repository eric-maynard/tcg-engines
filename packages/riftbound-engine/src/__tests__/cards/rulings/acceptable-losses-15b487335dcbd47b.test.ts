/**
 * Ruling 15b487335dcbd47b — Acceptable Losses (OGN-179 → ogn-179-298) · Spell · Chaos · [1] · [Action]
 *   "Each player kills one of their gear."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear [2] and × Gold (UNL-T05) · Gear token, as the gear on board.
 *
 * Q: Can I play Acceptable Losses if only ONE player controls a gear?
 * A: Yes. The spell does not target, so nothing has to be legal for it to go on the chain — it is playable even
 *    when the caster controls no gear at all, as long as (or even if not) the opponent does. At RESOLUTION each
 *    player who controls a gear chooses one of theirs to kill; a player with none simply does nothing.
 * Rules: 355.10.e ("each player kills one of their X" = a set chosen by each player at resolution, not targeting),
 *        355.8 (only targets gate putting a spell on the chain), 359.3.e.11 (follow instructions as far as
 *        possible), 357 (the cost is paid regardless).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const ZHONYAS = "ogn-077-298";
const GOLD = "unl-t05";

/** Only the OPPONENT has gear: P2 holds Zhonya's; P1 has none and 1 energy for the spell. */
function onlyOpponentHasGear() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

/** Only the CASTER has gear: P1 holds Zhonya's, P2 has none. */
function onlyCasterHasGear() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .gear(P1, ZHONYAS, "zh")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

/** Both players have gear (P2 has two, so P2 gets a real choice). */
function bothHaveGear() {
  return onlyCasterHasGear().gear(P2, GOLD, "gold").gear(P2, ZHONYAS, "zh2");
}

const chainTargets = (game: Game) => game.chain()[0]?.targets ?? [];

describe("Ruling 15b487335dcbd47b — Acceptable Losses is playable when only one player controls a gear", () => {
  test("caster controls NO gear, opponent does: the spell is a legal play, asks P1 for no object, and costs 1 all the same", async () => {
    const game = await onlyOpponentHasGear().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p1.can("cast", "al")).toBe(true);
    const targets = game.p1.option("cast", "al")?.fields.find((f) => f.arg === "targets");
    expect(targets === undefined || targets.max === 0).toBe(true); // 355.10.e — no targeting
    await game.p1.cast("al");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1, triggered: false })]);
    expect(chainTargets(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("…and on resolution only the gear-owning player acts: P2's lone Zhonya's dies with no prompt for anyone, P1 loses nothing", async () => {
    const game = await onlyOpponentHasGear().build();
    await game.p1.cast("al");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nobody was asked
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("p1body")).toBe("base"); // units are not gear
    expect(game.zoneOf("p2body")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the mirror case is equally legal — caster has the only gear: it is his own Zhonya's that dies, and the gearless opponent is skipped", async () => {
    const game = await onlyCasterHasGear().build();
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.can("cast", "al")).toBe(true);
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control — when both players do have gear each chooses among THEIR OWN: P1's single one is auto-killed and P2 is prompted over P2's two", async () => {
    const game = await bothHaveGear().build();
    await game.p1.cast("al");
    await game.settle(); // stops on P2's unscripted choice
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["gold", "zh2"]);
    await game.p2.pick("gold");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // P1's only gear, no choice
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.zoneOf("zh2")).toBe("base"); // the one P2 kept
    expect(game.violations()).toEqual([]);
  });
});
