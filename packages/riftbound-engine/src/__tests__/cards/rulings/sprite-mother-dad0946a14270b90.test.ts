/**
 * Ruling dad0946a14270b90 — Sprite Mother (OGN-106 → ogn-106-298) "When you play me, play a ready 3 [Might] Sprite unit
 *   token with [Temporary] here." × Sprite token (OGN-274 → ogn-274-298) "[Temporary]"
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit
 *   token into your base."
 *
 * Q: Does Viktor's effect trigger when Sprite Mother's Sprite tokens kill themselves (Temporary)?
 * A: Yes. The tokens are units and are not Recruits, so their death (even to their own Temporary) triggers Viktor and a
 *    Recruit token is played into the base.
 * Rules: 186 (tokens are game objects/units), 742/816 (Temporary kills at start of Beginning Phase), 383 (die triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const SPRITE = "ogn-274-298";
const VIKTOR_LEADER = "ogn-246-298";

function recruits(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  return game.findAll({ name: "Recruit" }).filter((id) => game.zoneOf(id) !== "gone");
}

describe("Ruling dad0946a14270b90 — a Sprite token dying to Temporary triggers Viktor, Leader", () => {
  test("P1's Sprite token dies at the start of P1's Beginning Phase; Viktor triggers and a 1-Might Recruit token appears in P1's base", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", SPRITE_MOTHER, "mother")
      .unit(P1, "base", SPRITE, "sprite")
      .build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, might: 3 });
    expect(game.state("sprite").keywords).toContain("Temporary");
    expect(recruits(game)).toEqual([]);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    // The Temporary kill is a trigger on the chain first.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite"));
    const r = recruits(game);
    expect(r).toHaveLength(1);
    expect(game.state(r[0] as string)).toMatchObject({ controller: P1, isToken: true, location: "base", might: 1 });
    expect(game.zoneOf("viktor")).toBe("base");
    expect(game.zoneOf("mother")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the token played BY Sprite Mother (not a seeded one) behaves the same: it dies to Temporary next turn and Viktor makes a Recruit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .hand(P1, SPRITE_MOTHER, "mother")
      .build();
    await game.p1.play("mother", { to: "base" });
    await game.settle();
    const sprites = game.findAll({ name: "Sprite" }).filter((id) => game.state(id).defId !== SPRITE_MOTHER && game.zoneOf(id) !== "gone");
    expect(sprites).toHaveLength(1);
    const [tok] = sprites as [string];
    expect(game.state(tok)).toMatchObject({ isToken: true, might: 3 });
    expect(recruits(game)).toEqual([]); // playing units kills nothing
    await game.advanceTurn(); // → P2
    expect(game.has(tok) && game.zoneOf(tok) !== "gone").toBe(true);
    await game.advanceTurn(); // → P1: Temporary trigger resolves, Sprite dies → Viktor
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone");
    const r = recruits(game);
    expect(r).toHaveLength(1);
    expect(game.state(r[0] as string)).toMatchObject({ controller: P1, isToken: true, location: "base", might: 1 });
    expect(game.violations()).toEqual([]);
  });
});
