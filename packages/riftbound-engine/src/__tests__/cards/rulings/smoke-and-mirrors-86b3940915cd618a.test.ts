/**
 * Ruling 86b3940915cd618a — Smoke and Mirrors (UNL-083 → unl-083-219) · [Hidden] Action [2]
 *     "Choose a unit you control and another unit you control at a different location. If at least one of them has
 *      [Temporary], move each to the other's location. Draw 1."
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) · 3 Might "When I move from a location, play a 3 [Might] Sprite unit
 *     token with [Temporary] there."   × Sprite (OGN-274 → ogn-274-298) 3-Might [Temporary] token.
 *
 * Q: How does Smoke and Mirrors work with Lillia?
 * A: If at least one chosen unit has [Temporary], both swap locations (and you draw 1). Lillia moved from her location,
 *    so her trigger goes on the chain AFTER the spell has fully resolved and, on resolution, plays a Sprite at the
 *    location she LEFT ("looks back"), even though she is elsewhere now. It works even if only the other unit is the
 *    Temporary one. If neither has [Temporary] nothing moves (so Lillia does not trigger) but you still draw.
 * Rules: 359.3.e (conditional instruction), 383 (triggered ability goes on the chain after the resolving spell),
 *        359.3.f.3 ("there" = origin snapshot), 340.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_AND_MIRRORS = "unl-083-219";
const LILLIA = "unl-082-219";
const SPRITE = "ogn-274-298";

/** P1's turn. Lillia (no Temporary) holds P1's bfA; a Sprite token (Temporary) and a plain Homebody sit in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "bfA", LILLIA, "lillia")
    .unit(P1, "base", SPRITE, "sprite")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, SMOKE_AND_MIRRORS, "snm");
}

describe("Ruling 86b3940915cd618a — Smoke and Mirrors swaps Lillia with a Temporary unit; her Sprite appears where she LEFT", () => {
  test("premise: Lillia herself is not Temporary, the Sprite is; {lillia, sprite} is an offered pair (different locations)", async () => {
    const game = await board().build();
    expect(game.state("lillia").keywords).not.toContain("Temporary");
    expect(game.state("sprite").keywords).toContain("Temporary");
    const pairs = (game.p1.option("cast", "snm")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs.some((p) => p.includes("lillia") && p.includes("sprite"))).toBe(true);
    // two base units are NOT at different locations → never paired together
    expect(pairs.some((p) => p.includes("home") && p.includes("sprite"))).toBe(false);
  });

  test("the spell resolves FIRST and completely: Lillia ⇄ Sprite swap, P1 draws 1 — and only then is Lillia's move trigger the sole item on the chain (no Sprite spawned yet)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length; // includes snm
    await game.p1.cast("snm", { targets: ["lillia", "sprite"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snm"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("snm")).toBe("trash");
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.locationOf("sprite")).toBe("bfA");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    await game.acceptTriggerOrder();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P1, triggered: true })]);
    expect(game.findAll({ name: "Sprite", owner: P1 })).toEqual(["sprite"]); // trigger not resolved yet
  });

  test("Lillia's trigger 'looks back': the new Temporary Sprite token is played at bfA (where she moved FROM), although Lillia is in base now", async () => {
    const game = await board().build();
    await game.p1.cast("snm", { targets: ["lillia", "sprite"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("lillia")).toBe("base");
    const sprites = game.findAll({ name: "Sprite", owner: P1 });
    expect(sprites).toHaveLength(2);
    const fresh = sprites.find((s) => s !== "sprite") as string;
    expect(game.locationOf(fresh)).toBe("bfA");
    expect(game.state(fresh)).toMatchObject({ isToken: true, might: 3 });
    expect(game.state(fresh).keywords).toContain("Temporary");
    expect(game.p1.units("bfA").toSorted()).toEqual([fresh, "sprite"].toSorted());
    expect(game.violations()).toEqual([]);
  });

  test("if NEITHER chosen unit has [Temporary] (Lillia + Homebody): nothing moves, Lillia does not trigger, but P1 still draws 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("snm", { targets: ["lillia", "home"] });
    await game.settle();
    expect(game.zoneOf("snm")).toBe("trash");
    expect(game.locationOf("lillia")).toBe("bfA");
    expect(game.locationOf("home")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.findAll({ name: "Sprite", owner: P1 })).toEqual(["sprite"]);
    expect(game.chain()).toEqual([]);
  });
});
