/**
 * Interaction: Mirror Image (unl-200-219) — Spell (Action), Mind/Order, 3 energy + 2 power:
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that
 *      unit. Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase,
 *      before scoring.)"
 *   × Peak Guardian (ogn-223-298) — Unit, Order, 6 energy + [order], 5 Might:
 *     "When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units there."
 *   × Discipline (ogn-058-298) — "+2 [Might] this turn" (represented here as the +2 turn modifier
 *     already applied to Peak Guardian).
 *
 * Rules: 477.1.b.1 / .a / .b (copy = copyable traits — name, type, tags, cost, domain, rules text —
 * by default the PRINTED traits; copying a copy copies its current copyable traits), 185.3.a.2
 * (a copied cost is appended to the token), 187.6 (Reflection = domainless 0-Might unit token),
 * 183 (token owner/controller = the player who played it), 383.2.c (trigger conditions are
 * evaluated when the event happens — the token was "played" before it became a copy, so copied
 * "When you play me" does not fire), 477.2.a (Temporary is a separate keyword grant, not part of
 * the copy), 702.3 / 704 (a buff is a counter on that object, not a copyable trait), 816.1.b
 * (Temporary: kill at the start of controller's Beginning Phase).
 *
 * Question: P2's Peak Guardian at bf1 is buffed (+1), has +2 Might this turn, 3 damage, exhausted
 * (currently 8 Might). P1 casts Mirror Image choosing it.
 *   (a) an ENEMY unit is a legal choice ("Choose a unit").
 *   (b) result: a READY, undamaged, unbuffed 5-Might unit token named "Peak Guardian" (cost 6,
 *       Order) with Temporary, in P1's base, owned and controlled by P1; the original is untouched.
 *   (c) the copied "When you play me, buff me" does NOT trigger.
 *   (d) Mirror Imaging that Reflection yields another 5-Might Peak Guardian with Temporary; the
 *       first keeps Temporary. And Temporary kills the token at the start of P1's next turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const PEAK_GUARDIAN = "ogn-223-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's newest unit-ish card in base that was not there in `before`. */
function newTokenIn(game: Game, before: readonly string[]): string | undefined {
  return game.p1.base().find((id) => !before.includes(id));
}

/**
 * P2 holds bf1 with a Peak Guardian that is buffed, +2 Might this turn (Discipline), 3 damage and
 * exhausted → 8 Might. P1 has a vanilla ally, two Mirror Images and enough to cast both.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", PEAK_GUARDIAN, "peak", { buffed: true, damage: 3, exhausted: true, mightModifier: 2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .resources(P1, { energy: 6, power: { mind: 2, order: 2 } })
    .hand(P1, MIRROR_IMAGE, "mirror1")
    .hand(P1, MIRROR_IMAGE, "mirror2");
}

describe("Mirror Image × Peak Guardian — a copy takes printed traits only", () => {
  test("premise: the enemy Peak Guardian currently reads 8 Might (5 printed +1 buff +2 this turn), 3 damage, exhausted", async () => {
    const game = await board().build();
    const s = game.state("peak");
    expect(s.baseMight).toBe(5);
    expect(s.might).toBe(8);
    expect(s.isBuffed).toBe(true);
    expect(s.damage).toBe(3);
    expect(s.isExhausted).toBe(true);
    expect(s.controller).toBe(P2);
  });

  test.failing("BUG: (a) Mirror Image says 'Choose a unit' — the ENEMY Peak Guardian (and P1's own ally) must be offered as choices. Engine asks for no target at all", async () => {
    // Expected: a `targets` field offering peak and ally. Actual: Mirror Image has no target step;
    // the token "copies" the spell itself.
    const game = await board().build();
    const offered = targetsOffered(game, "mirror1");
    expect(offered).toContain("peak");
    expect(offered).toContain("ally");
    await game.p1.cast("mirror1", { targets: "peak" });
    expect(game.p1.resources().energy).toBe(3); // paid 3 of 6
  });

  test("casting Mirror Image (3 energy + 2 power) puts a token into P1's base that P1 owns and controls; the original Peak Guardian is untouched (183)", async () => {
    const game = await board().build();
    const before = game.p1.base();
    // `answers` feeds the unit choice if/when the engine asks for it.
    await game.p1.cast("mirror1", { answers: ["peak"] });
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.power()).toBe(2);
    await game.settle();
    expect(game.zoneOf("mirror1")).toBe("trash");
    const token = newTokenIn(game, before);
    expect(token).toBeDefined();
    const t = game.state(token as string);
    expect(t.isToken).toBe(true);
    expect(t.owner).toBe(P1);
    expect(t.controller).toBe(P1);
    expect(t.location).toBe("base");
    // The copied unit is not modified in any way.
    const p = game.state("peak");
    expect(p.controller).toBe(P2);
    expect(p.location).toBe("bf1");
    expect(p.might).toBe(8);
    expect(p.damage).toBe(3);
    expect(p.isExhausted).toBe(true);
    expect(p.isBuffed).toBe(true);
  });

  test.failing("BUG: (b) the Reflection becomes a READY, undamaged, unbuffed 5-Might unit named 'Peak Guardian' (cost 6, Order) with Temporary (477.1.b.1, 187.6, 702/704, 477.2.a). Engine copies the Mirror Image spell and enters the token exhausted without Temporary", async () => {
    // Expected: printed traits only — name/type/cost/domain/rules text + printed Might 5; none of the
    // original's buff, +2-this-turn, damage or exhaustion; plus a separately granted Temporary.
    // Actual: token is cardType "spell" named "Mirror Image", 0 Might, exhausted, no Temporary.
    const game = await board().build();
    const before = game.p1.base();
    await game.p1.cast("mirror1", { targets: "peak" });
    await game.settle();
    const token = newTokenIn(game, before);
    expect(token).toBeDefined();
    const t = game.state(token as string);
    expect(t.name).toBe("Peak Guardian");
    expect(t.cardType).toBe("unit");
    expect(t.energyCost).toBe(6);
    expect(t.domains).toEqual(["order"]);
    expect(t.baseMight).toBe(5);
    expect(t.might).toBe(5);
    expect(t.isBuffed).toBe(false);
    expect(t.mightModifier).toBe(0);
    expect(t.damage).toBe(0);
    expect(t.isReady).toBe(true);
    expect(t.keywords).toContain("Temporary");
    expect(game.p1.units("base")).toContain(token as string);
  });

  test("(c) the copied 'When you play me, buff me' does NOT trigger — the token was played before it became a copy (383.2.c); nothing gets buffed", async () => {
    const game = await board().build();
    const before = game.p1.base();
    await game.p1.cast("mirror1", { answers: ["peak"] });
    await game.settle();
    expect(game.chain()).toEqual([]); // no play-trigger waiting on the chain
    const token = newTokenIn(game, before);
    expect(token).toBeDefined();
    expect(game.state(token as string).isBuffed).toBe(false);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("peak").might).toBe(8); // original not re-buffed / touched
  });

  test.failing("BUG: (d) Mirror Imaging the Reflection copies its CURRENT copyable traits → a second 5-Might 'Peak Guardian' token with Temporary; the first keeps Temporary (477.1.b.1.b, 477.2.a)", async () => {
    // Expected: two P1 tokens named Peak Guardian, 5 Might, both with Temporary.
    // Actual: no unit can be chosen at all; tokens are copies of the spell.
    const game = await board().build();
    const before = game.p1.base();
    await game.p1.cast("mirror1", { targets: "peak" });
    await game.settle();
    const first = newTokenIn(game, before) as string;
    expect(first).toBeDefined();
    expect(targetsOffered(game, "mirror2")).toContain(first);
    await game.p1.cast("mirror2", { targets: first });
    await game.settle();
    const second = newTokenIn(game, [...before, first]) as string;
    expect(second).toBeDefined();
    for (const tok of [first, second]) {
      const t = game.state(tok);
      expect(t.name).toBe("Peak Guardian");
      expect(t.might).toBe(5);
      expect(t.keywords).toContain("Temporary");
      expect(t.controller).toBe(P1);
    }
    expect(game.findAll({ name: "Peak Guardian" })).toHaveLength(3);
  });

  test.failing("BUG: Temporary — the Reflection is killed at the start of P1's next Beginning Phase (816.1.b) and, being a token, ceases to exist. Engine never grants Temporary so it survives", async () => {
    // Expected: after P2's turn, at the start of P1's turn the token dies (not on the board any more).
    // Actual: the token is still in P1's base on P1's next main phase.
    const game = await board().build();
    const before = game.p1.base();
    await game.p1.cast("mirror1", { answers: ["peak"] });
    await game.settle();
    const token = newTokenIn(game, before) as string;
    expect(token).toBeDefined();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.base()).toContain(token); // still alive during the opponent's turn
    await game.advanceTurn(); // → P1: Beginning Phase kills it before scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.base()).not.toContain(token);
    expect(game.p1.units()).not.toContain(token);
  });
});
