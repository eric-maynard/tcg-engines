/**
 * Ruling ca587eb1f8ad3289 — Reflection token (UNL-T06) · Unit token · 0 Might
 *   "(I become a copy of something when played. I don't get that card's play effects.)"
 *   × Mirror Image (UNL-200 → unl-200-219) · Spell · [3][R][R] — "Choose a unit. Play a ready Reflection unit token to
 *     your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Deceiver (UNL-199 → unl-199-219) · Legend — "When you conquer or hold, you may discard 1 and exhaust me to play a
 *     ready Reflection unit token there. It becomes a copy of another unit there. Give it [Temporary]."
 *
 * Q: Are Reflection tokens 0 Might once they copy something (via Mirror Image or Deceiver)?
 * A: No. The token is created at 0 Might but the copy effect makes it adopt the target's copyable traits —
 *    printed Might and rules text. It does NOT inherit granted/appended modifications (temporary +Might, buffs).
 * Rules: 184.6 (token creation), copy effects / copyable traits (472.1.b.3), FAQ #9999 / #9410.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const DECEIVER = "unl-199-219";
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-Might unit with a printed identity to copy

const reflectionOf = (game: Game) => game.p1.units().find((u) => game.state(u).isToken);

describe("Ruling ca587eb1f8ad3289 — a Reflection token takes the copied unit's PRINTED Might, not 0 (and not its modifiers)", () => {
  test("Mirror Image on Shipyard Skulker (3): a ready Reflection token appears in P1's base as a 3-Might 'Shipyard Skulker' with [Temporary]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1")
      .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
      .hand(P1, MIRROR_IMAGE, "mi")
      .build();
    await game.p1.cast("mi", { targets: "skulker" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("mi")).toBe("trash");
    const token = reflectionOf(game);
    expect(token).toBeDefined();
    expect(game.state(token!)).toMatchObject({ baseMight: 3, isReady: true, isToken: true, location: "base", might: 3, name: "Shipyard Skulker" });
    expect(game.state(token!).keywords).toContain("Temporary");
    expect(game.state(token!).might).not.toBe(0);
  });

  test("only copyable traits: copying a Skulker that carries +2 [Might] this turn (5 total) still yields a 3-Might Reflection", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1")
      .unit(P1, "base", SHIPYARD_SKULKER, "skulker", { mightModifier: 2 })
      .hand(P1, MIRROR_IMAGE, "mi")
      .build();
    expect(game.state("skulker")).toMatchObject({ baseMight: 3, might: 5 });
    await game.p1.cast("mi", { targets: "skulker" });
    await game.settle();
    const token = reflectionOf(game);
    expect(token).toBeDefined();
    expect(game.state(token!)).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0, name: "Shipyard Skulker" });
    expect(game.state("skulker").might).toBe(5); // the original keeps its bonus
  });

  test("Deceiver: on conquering bf1 with Skulker, P1 may discard 1 + exhaust the legend → a ready Reflection token AT bf1 that is a 3-Might copy of Skulker with [Temporary]", async () => {
    const game = await scenario()
      .legend(P1, DECEIVER, "deceiver")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
      .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
      .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Fodder" }, "fodder")
      .build();
    await game.p1.move("skulker", "bf1");
    const r = await game.settle(); // combat: 3 vs 1 → P1 conquers; Deceiver's "you may" is asked
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fodder"); // the card to discard
    }
    await game.settle({ policy: "first" }); // trigger resolves; "another unit there" = Skulker (forced)
    expect(game.state("deceiver").isExhausted).toBe(true);
    expect(game.p1.trash()).toContain("fodder");
    const token = reflectionOf(game);
    expect(token).toBeDefined();
    expect(game.state(token!)).toMatchObject({ baseMight: 3, isReady: true, isToken: true, location: "bf1", might: 3, name: "Shipyard Skulker" });
    expect(game.state(token!).keywords).toContain("Temporary");
  });
});
