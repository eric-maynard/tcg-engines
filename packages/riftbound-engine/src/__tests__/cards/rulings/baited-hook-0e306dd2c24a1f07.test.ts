/**
 * Ruling 0e306dd2c24a1f07 — Baited Hook (OGN-242 → ogn-242-298, Gear, 3)
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *    among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Trifarian War Camp (ogn-294-298, Battlefield) "Units here have +1 [Might]."
 *
 * Q: Baited Hook kills a unit standing at Trifarian War Camp — is the ceiling based on printed Might or the +1 Might?
 * A: The buffed Might. The effect looks back at the unit's LAST KNOWN information on the board, which includes the
 *    War Camp's +1.
 * Rules: 359.3.f.2 (referents checked on execution), 359.3.e.13/14 (last known information for a card that left the
 *        board), 522 (statics apply continuously while on the board).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. Bait (printed 3) stands at `where`; Trifarian War Camp is live (P1's). P1: Baited Hook ready, exactly
 * [1][order]. Deck top→: Five (5), Six (6), Four (4), Junk (spell), Two (2).
 */
function board(where: "camp" | "base") {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, where, { might: 3, name: "Bait" }, "bait")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
        { cardType: "unit", energyCost: 6, might: 6, name: "Six" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
      ],
      ["five", "six", "four", "junk", "two"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/** Activate the Hook (Bait is the kill target) and drive to the look-at-5 offer. */
async function hookBait(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle(); // priorities + the scripted "bait" answer if the target is asked on resolution
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P1);
  return d as Pick;
}

const offered = (d: Pick) => d.options.map((o) => o.card ?? o.key).sort();

describe("Ruling 0e306dd2c24a1f07 — Baited Hook reads the killed unit's LAST KNOWN Might, War Camp +1 included", () => {
  test("premise: at Trifarian War Camp the printed-3 Bait is a 4-Might unit (static +1)", async () => {
    const game = await board("camp").build();
    expect(game.state("bait")).toMatchObject({ baseMight: 3, location: "camp", might: 4 });
  });

  test("killed AT the War Camp: last known Might 4 → ceiling 5 → the look offers Five, Four and Two (units ≤ 5) — not Six, not the spell", async () => {
    const game = await board("camp").build();
    const d = await hookBait(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["five", "four", "two"]);
    expect(d.allowDecline).toBe(true); // "you may"
    await game.p1.pick("five");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("five")).toBe("base"); // played, ignoring its cost
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same printed-3 Bait killed in BASE (no +1) → ceiling 4 → Five is NOT offered (only Four and Two)", async () => {
    const game = await board("base").build();
    expect(game.state("bait").might).toBe(3);
    const d = await hookBait(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["four", "two"]);
  });
});
