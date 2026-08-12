/**
 * Ruling 88cb5e598d1e0570 — The Boss (OGN-269 → ogn-269-298, the Sett legend)
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *   × Falling Star (OGN-029 → ogn-029-298) · 2 + [fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Can Sett's legend stop a unit sitting IN BASE from dying to Falling Star?
 * A: Yes — the replacement cares about the unit being buffed and Sett being ready (and the [rainbow]),
 *    not about where on the board the unit stands.
 * Rules: 370–373 (die replacements), 371.2 (optional costed shield), 359.3.e (resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const FALLING_STAR = "ogn-029-298";

/**
 * P1's turn with Falling Star and its cost. P2: The Boss (ready), a [body] rune's worth of power for
 * the [rainbow], a BUFFED 2-Might unit in BASE (effective 3) and a fat decoy for the second half.
 */
function board(opts: { buffed?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 0, power: { body: 1 } })
    .legend(P2, THE_BOSS, "boss")
    .unit(P2, "base", { might: 2, name: "Runt" }, "runt", { buffed: opts.buffed ?? true })
    .unit(P2, "base", { might: 9, name: "Decoy" }, "decoy")
    .hand(P1, FALLING_STAR, "star");
}

/** P1 aims one half of Falling Star at the buffed unit in base and the other at the decoy, then passes. */
async function starOnRunt(game: Game): Promise<void> {
  await game.p1.cast("star", { targets: ["runt", "decoy"] });
  expect(game.chain()[0]).toMatchObject({ cardId: "star", controller: P1 });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 88cb5e598d1e0570 — Sett's legend saves a BASE unit from Falling Star", () => {
  test("the unit is in base and 3 damage is lethal on its buffed 3 Might — The Boss offers its 'you may' to P2", async () => {
    const game = await board().build();
    expect(game.locationOf("runt")).toBe("base");
    expect(game.state("runt")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
    await starOnRunt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    expect(game.zoneOf("runt")).toBe("base"); // not dead yet
  });

  test("YES: the unit is healed, un-buffed, exhausted and recalled instead of dying — Sett exhausts and the [rainbow] is spent", async () => {
    const game = await board().build();
    await starOnRunt(game);
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("runt")).toBe("base"); // alive, in base
    expect(game.state("runt")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("body")).toBe(0);
    expect(game.zoneOf("decoy")).toBe("base"); // 3 damage on a 9-Might unit is not lethal
    expect(game.zoneOf("star")).toBe("trash");
  });

  test("declining lets it die normally", async () => {
    const game = await board().build();
    await starOnRunt(game);
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p2.power("body")).toBe(1);
  });

  test("no buff to spend ⇒ the save is never offered and the unit dies", async () => {
    const game = await board({ buffed: false }).build();
    expect(game.state("runt")).toMatchObject({ isBuffed: false, might: 2 });
    await starOnRunt(game);
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the rest of the cost still has to be payable: with no [rainbow] available the save cannot happen", async () => {
    const noPower = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .resources(P2, { energy: 0 })
      .legend(P2, THE_BOSS, "boss")
      .unit(P2, "base", { might: 2, name: "Runt" }, "runt", { buffed: true })
      .unit(P2, "base", { might: 9, name: "Decoy" }, "decoy")
      .hand(P1, FALLING_STAR, "star")
      .build();
    expect(noPower.state("boss").isExhausted).toBe(false); // Sett is ready — only the power is missing
    await starOnRunt(noPower);
    await noPower.settle();
    expect(noPower.zoneOf("runt")).toBe("trash");
    expect(noPower.violations()).toEqual([]);
  });
});
