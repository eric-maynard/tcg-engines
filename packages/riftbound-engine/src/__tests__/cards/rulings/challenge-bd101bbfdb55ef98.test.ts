/**
 * Ruling bd101bbfdb55ef98 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · [2][body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Vi, Hotheaded (unl-030-219) — "[Deflect] … [2][fury]: Double my Might this turn." (no Reaction tag)
 *   × Seal of Strength (ogn-163-298) — "[Exhaust]: [Reaction] — [Add] [body]." (Reaction-tagged ability)
 *
 * Q: Can you activate Vi in response to something like Challenge, to make her bigger?
 * A: No. An ability needs the [Reaction] tag to be used in response to something. Untagged abilities can
 *    only be used on your own turn while the game is in a Neutral Open state — never with a chain sitting
 *    there waiting to resolve.
 * Rules: 309.1.a (Closed State: only [Reaction] cards and abilities), 310.1/310.2 (Neutral Open vs Closed),
 *        151.2 (an untagged activated ability follows [Action] timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const VI_HOTHEADED = "unl-030-219";
const SEAL_OF_STRENGTH = "ogn-163-298";

/** P1's turn. P1's Ally and P2's Vi share bf1; P1 has the [rainbow] for Vi's [Deflect]. P2 can pay for Vi. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1, rainbow: 1 } })
    .resources(P2, { energy: 3, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Ally" }, "ally")
    .unit(P2, "bf1", VI_HOTHEADED, "vi")
    .gear(P2, SEAL_OF_STRENGTH, "seal")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling bd101bbfdb55ef98 — Vi's untagged ability cannot answer Challenge", () => {
  test("ruling: with Challenge on the chain, P2 has priority but Vi's ability is not on the menu", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["ally", "vi"] });
    await game.p1.passPriority();

    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.energy()).toBeGreaterThanOrEqual(2); // she is affordable — timing is what stops it
    expect(game.p2.can("activate", "vi")).toBe(false);
    const r = await game.p2.try((p) => p.activate("vi", 1));
    expect(r.ok).toBe(false);
    expect(game.state("vi").might).toBe(3); // never doubled
  });

  test("nuance: an ability that DOES carry the [Reaction] tag is legal in that same window", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["ally", "vi"] });
    await game.p1.passPriority();
    expect(game.p2.can("activate", "seal")).toBe(true);
  });

  test("ruling: so Challenge resolves against the un-doubled Vi — 4 vs 3 kills her, and she takes the Ally with her", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["ally", "vi"] });
    await game.settle();
    expect(game.zoneOf("vi")).toBe("trash"); // 4 damage on a 3-Might unit
    expect(game.state("ally").damage).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: an untagged ability is also unusable on the opponent's turn even with no chain at all", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("activate", "vi")).toBe(false);
  });

  test("control: on her controller's own turn, in a Neutral Open state, Vi's ability IS usable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 2 } })
      .unit(P1, "base", VI_HOTHEADED, "vi")
      .build();
    expect(game.p1.can("activate", "vi")).toBe(true);
    await game.p1.activate("vi", 1);
    await game.settle();
    expect(game.state("vi").might).toBe(6);
  });
});
