/**
 * Ruling 91af2468caa0cf8c — (no specific card) tokens whose card type is not a played type.
 *   Exercised with Forge of the Future (OGN-212 → ogn-212-298), whose play trigger PLAYS a
 *   1-Might Recruit unit token at your base.
 *
 * Q: Are there tokens that are not "played"? What does "if their card type is played" mean?
 * A: A token is played only when its TYPE is a type that gets played. Units, gear and spells are, so a
 *    unit token really is played (valid-location rules, enters exhausted, and so on). Battlefields are
 *    not played, so a token battlefield — today the only such case, the one that replaces a conceding
 *    player's battlefield in a multiplayer game — is never "played".
 * Rules: 185.2.a (a token can be played by its owner IF its card type is played), 185.2.d (a token
 *        follows all rules of its type), 355.2.a (valid locations: your base or a battlefield you
 *        control), 652.2 / 652.2.a (a conceding player's battlefield is replaced with a token
 *        battlefield with no abilities), 113/486.5 (battlefields are set aside and placed, never played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

const FORGE = "ogn-212-298";

describe("Ruling 91af2468caa0cf8c — a unit token IS played; a battlefield token is not", () => {
  test("unit is a played type: Forge's Recruit token goes through the play process and lands at the base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .hand(P1, FORGE, "forge")
      .build();
    await game.p1.play("forge");
    await game.settle();
    const tokens = game.p1.units("base");
    expect(tokens).toHaveLength(1);
    const recruit = tokens[0] as string;
    expect(game.state(recruit)).toMatchObject({ cardType: "unit", isToken: true, might: 1 });
    expect(game.locationOf(recruit)).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("because it is played, the token obeys the play rules of its type — it enters exhausted (143.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .hand(P1, FORGE, "forge")
      .build();
    await game.p1.play("forge");
    await game.settle();
    const recruit = game.p1.units("base")[0] as string;
    expect(game.state(recruit).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("battlefields are not a played type at all: no play action for a battlefield is ever offered", async () => {
    const game = await scenario().battlefield("bf1").build();
    const plays = game.p1.legal().filter((o) => o.verb === "play" || o.verb === "cast");
    expect(plays.some((o) => o.card === "bf1")).toBe(false);
    expect(game.p1.can("play", "bf1")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test(
    "ruling 91af2468caa0cf8c / rule 652.2.a — a conceding player's battlefield is REPLACED by a token battlefield (a token that is never 'played')",
    async () => {
      const game = await scenario({ players: 3 })
        .battlefield("bf1", { owner: P1 })
        .battlefield("bf3", { controller: P3, owner: P3 })
        .unit(P3, "bf3", { might: 2, name: "Guard" }, "guard")
        .unit(P2, "base", { might: 2, name: "Thug" }, "thug")
        .build();
      expect(game.state("bf3").isToken).toBe(false);
      await game.seat(P3).concede();
      await game.settle();
      expect(game.isOver()).toBe(false); // two players remain, so the Removal steps run (651.2)
      expect(game.has("bf3")).toBe(true); // the slot is still on the board (652.2.b)
      expect(game.state("bf3").isToken).toBe(true); // …now as a token battlefield with no abilities
    },
  );
});
