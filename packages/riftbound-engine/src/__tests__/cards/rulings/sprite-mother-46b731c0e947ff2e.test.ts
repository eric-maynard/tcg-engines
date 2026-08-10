/**
 * Ruling 46b731c0e947ff2e — Sprite Mother (OGN-106 → ogn-106-298) · Unit · Mind · 4+[mind] · 3 Might
 *   "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × Sprite token (OGN-274 → ogn-274-298)
 *   (+ Gust ogn-169-298 "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand" and an
 *    inline [Reaction] "Kill a unit" as the removal played in response.)
 *
 * Q: If Sprite Mother is killed in response to her play trigger, does the Sprite still come out?
 * A: No. The trigger goes on the chain and can be responded to at Reaction speed; "here" is read on resolution and
 *    needs Sprite Mother to still be on the board — if she was removed in that window no Sprite is created.
 * Rules: 383 (trigger on the chain, respondable), 359.3 (referents like "here" evaluated on resolution), 155.2.b.3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const GUST = "ogn-169-298";
/** Inline stand-in for "a Reaction that kills her" — the ruling is agnostic about which removal is used. */
const SNUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Snuff (inline reaction kill)",
  timing: "reaction",
} as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function sprites(game: Game): string[] {
  return game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.state(id).defId !== SPRITE_MOTHER && game.zoneOf(id) !== "gone");
}

/** P1's turn, exactly [4][mind]; P1 controls bf1 (a Holder there) so Mother may be played to base or bf1. P2: [1] + a Reaction. */
function board(reaction: typeof SNUFF | string) {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, SPRITE_MOTHER, "mother")
    .hand(P2, reaction, "rx");
}

describe("Ruling 46b731c0e947ff2e — no Sprite if Sprite Mother is gone when her trigger resolves", () => {
  test("baseline: played to base unopposed, the trigger resolves and a ready 3-Might Temporary Sprite token appears 'here' (base)", async () => {
    const game = await board(SNUFF).build();
    await game.p1.play("mother", { to: "base" });
    await game.settle();
    expect(game.zoneOf("mother")).toBe("base");
    const made = sprites(game);
    expect(made).toHaveLength(1);
    const sprite = made[0] as string;
    expect(game.locationOf(sprite)).toBe("base");
    expect(game.state(sprite)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.state(sprite).keywords).toContain("Temporary");
  });

  test("the play trigger sits on the chain and P2 gets a Reaction window before it resolves", async () => {
    const game = await board(SNUFF).build();
    await game.p1.play("mother", { to: "base" });
    expect(game.zoneOf("mother")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mother", controller: P1, triggered: true })]);
    expect(sprites(game)).toEqual([]); // nothing yet — it waits for resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.can("cast", "rx")).toBe(true);
  });

  test("P2 kills Sprite Mother in response (Reaction resolves first, LIFO): when her trigger resolves 'here' is undefined — NO Sprite token is created", async () => {
    const game = await board(SNUFF).build();
    await game.p1.play("mother", { to: "base" });
    await game.p1.passPriority();
    await game.p2.cast("rx", { targets: "mother" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mother", "rx"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mother")).toBe("trash");
    expect(sprites(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("same outcome with a real bounce: Mother played to bf1, P2 Gusts her back to hand in response → trigger resolves with no 'here' → no Sprite anywhere", async () => {
    const game = await board(GUST).build();
    await game.p1.play("mother", { to: "bf1" });
    expect(game.zoneOf("mother")).toBe("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.cast("rx", { targets: "mother" });
    await game.settle();
    expect(game.zoneOf("mother")).toBe("hand");
    expect(sprites(game)).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.p1.units("base")).toEqual([]);
  });
});
