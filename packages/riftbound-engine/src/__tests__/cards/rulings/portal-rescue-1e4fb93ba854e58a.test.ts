/**
 * Ruling 1e4fb93ba854e58a — Portal Rescue (OGN-102 → ogn-102-298, Action, 3 + [mind])
 *   "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   × Reflection token (unl-t06) "(I become a copy of something when played. I don't get that card's play effects.)"
 *   (token made here by Mirror Image, unl-200-219: "Choose a unit. Play a ready Reflection unit token to your base.
 *    It becomes a copy of that unit. Give it [Temporary].")
 *
 * Q: How do Portal Rescue and Reflection tokens with "When you play me" triggers interact?
 * A: Portal Rescue may target a token, but banishing it puts it in a non-board zone where a token ceases to exist;
 *    the "play it to base" part then has nothing to play, so nothing returns and no "When you play me" ability
 *    triggers. (A token an effect explicitly "plays" IS played — Mirror Image's token arrives via a play.)
 * Rules: 186.1 / 187 (tokens cease to exist off the board), 359.3.e (do as much as you can; the play fails),
 *        182.1.a / 350.2 (an effect that says "play" plays the token).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const MIRROR_IMAGE = "unl-200-219";
const UNDERTITAN = "sfd-175-221"; // 5 Might · "When you play me, give your other units +2 [Might] this turn. …"

/**
 * P1's turn. P1: Undertitan (5) and a 1-Might Pal in base; Mirror Image ([3] + 2 power, paid from mind) and Portal
 * Rescue (3 + [mind]) in hand with exactly enough for both (6 energy, 3 mind). P2 idle.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 3 } })
    .unit(P1, "base", UNDERTITAN, "titan")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, MIRROR_IMAGE, "mi")
    .hand(P1, PORTAL_RESCUE, "portal");
}

const tokensInP1Base = (game: Game) => game.p1.units("base").filter((id) => game.state(id).isToken);

/** Mirror Image on Undertitan → a ready Reflection token that is a 5-Might Undertitan copy. Returns its id. */
async function makeReflection(game: Game): Promise<string> {
  await game.p1.cast("mi", { targets: "titan" });
  await game.settle();
  expect(game.zoneOf("mi")).toBe("trash");
  const toks = tokensInP1Base(game);
  expect(toks).toHaveLength(1);
  return toks[0] as string;
}

describe("Ruling 1e4fb93ba854e58a — Portal Rescue on a Reflection token: banished, ceases to exist, never re-played", () => {
  test("premise: Mirror Image PLAYS the token (an effect that says 'play') — it is a ready 5-Might Undertitan copy, and being a Reflection it did NOT get Undertitan's play effect (Pal is still 1)", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 5, name: "Undertitan" });
    expect(game.state("pal").might).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
  });

  test("Portal Rescue can target the token (a friendly unit)", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    expect(game.p1.can("cast", "portal")).toBe(true);
    const offered = game.p1.option("cast", "portal")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain(tok);
  });

  test("resolving it on the token: the token is banished → ceases to exist ('gone', in no zone, not in banishment); the 'play it to base' part finds nothing — no unit comes back, no 'When you play me' fires (Pal still 1), Portal Rescue just goes to the trash", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    const baseBefore = game.p1.units("base").filter((id) => id !== tok).sort();
    await game.p1.cast("portal", { targets: tok });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("portal")).toBe("trash");
    // The token no longer exists anywhere.
    expect(game.has(tok)).toBe(false);
    expect(game.cardsAt("base")).not.toContain(tok);
    expect(game.cardsAt("banishment")).not.toContain(tok);
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.chain()).toEqual([]);
    expect(tokensInP1Base(game)).toEqual([]);
    // Nothing was played: same non-token units, no play trigger of the copied Undertitan.
    expect(game.p1.units("base").sort()).toEqual(baseBefore);
    expect(game.state("pal").might).toBe(1);
    expect(game.state("titan").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Portal Rescue on the REAL Undertitan: banished then played to base for free as a new object, and its 'When you play me' DOES fire (Pal and the token get +2)", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    await game.p1.cast("portal", { targets: "titan" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.zoneOf("titan")).toBe("base");
    expect(game.p1.banishment()).not.toContain("titan");
    expect(game.state("pal").might).toBe(3);
    expect(game.state(tok).might).toBe(7);
  });
});
