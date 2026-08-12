/**
 * Ruling 4ef6ab382699b79d — Facebreaker (OGN-220 → ogn-220-298) · [Action] · [2] · [Hidden]
 *   "Stun a friendly unit and an enemy unit at the same battlefield."
 *   × Resonating Strike (VEN-034 → ven-034-166) · [Reaction] · [2][calm] "Choose a battlefield you control
 *     and a unit you control at a different location. Move that unit to that battlefield and give it +2
 *     [Might] this turn." — the way to move a chosen unit while the spell is still on the chain.
 *   × Piercing Light (SFD-023 → sfd-023-221) "Deal 2 to a unit at a battlefield, …" — a single-object case.
 *
 * Q: A spell chooses a unit at a battlefield and the unit is moved to a DIFFERENT battlefield before the
 *    spell resolves. Does the spell still affect its original choice?
 * A: Yes — the requirement is "at a battlefield" and the unit is still at one, so it is affected where it
 *    now stands. The nuance is Facebreaker's "at the SAME battlefield": once the pair are apart the spell
 *    whiffs and neither is stunned. It still resolves; it simply does nothing.
 * Rules: 359.3.e.5 / 355.15 (objects are re-checked against the requirement at resolution, not against the
 *        place they were in), 359.3 (an item with no legal objects still resolves and does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const RESONATING_STRIKE = "ven-034-166";
const PIERCING_LIGHT = "sfd-023-221";

/**
 * P1's turn: Facebreaker ([2]) and Resonating Strike ([2][calm]) in hand. bf1 holds P1's Ally and P2's Foe;
 * bf2 is a second battlefield P1 controls (with an Anchor keeping it), so the Ally has somewhere to go.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "bf2", { might: 2, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 2, name: "Squatter" }, "squatter")
    .hand(P1, FACEBREAKER, "fb")
    .hand(P1, RESONATING_STRIKE, "rs");
}

/** Cast Facebreaker on the pair standing together at bf1 and keep the chain open. */
async function facebreakerOnThePair(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("fb", { targets: ["ally", "foe"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
  expect(game.state("ally").isStunned).toBe(false);
  return game;
}

/** Answer with Resonating Strike: the Ally moves to bf2 while Facebreaker is still on the chain. */
async function strikeAllyToBf2(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rs")).toBe(true); // [Reaction] — legal in this Closed State
  await game.p1.cast("rs", { targets: "ally" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "rs"]);
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("bf2"); // "a battlefield you control" — asked as Resonating Strike resolves
    await game.settle();
  }
}

describe("Ruling 4ef6ab382699b79d — a chosen unit that changed battlefield is still 'at a battlefield'", () => {
  test("baseline: left alone, Facebreaker stuns both members of the pair at bf1", async () => {
    const game = await facebreakerOnThePair();
    await game.settle();
    expect(game.state("ally").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.zoneOf("fb")).toBe("trash");
  });

  // Expected (ruling): "at the same battlefield" is a requirement on the PAIR, so once they are apart the
  // whole spell whiffs and neither unit is stunned. Actual: the engine re-checks each object on its own —
  // the enemy half fails its "same location" clause and is spared, but the friendly half is still "a
  // friendly unit at a battlefield" and gets stunned at its new battlefield.
  test.failing("BUG: ruling 4ef6ab382699b79d — with the pair split, NEITHER should be stunned; engine still stuns the friendly half at its new battlefield", async () => {
    const game = await facebreakerOnThePair();
    await strikeAllyToBf2(game);
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("ally").isStunned).toBe(false);
    expect(game.state("foe").isStunned).toBe(false);
  });

  test("the enemy half of the pair, at least, is definitely spared once the two are apart", async () => {
    const game = await facebreakerOnThePair();
    await strikeAllyToBf2(game);
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("…and it whiffed rather than fizzled: Facebreaker did resolve into the trash, and both of its objects are still on the board", async () => {
    const game = await facebreakerOnThePair();
    await strikeAllyToBf2(game);
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
  });

  test("ruling 4ef6ab382699b79d — the general rule, on a single-object requirement: Piercing Light names a unit 'at a battlefield', the unit moves to a different battlefield, and it is still hit there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1, fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Ally" }, "ally")
      .unit(P1, "bf2", { might: 2, name: "Anchor" }, "anchor")
      .hand(P1, PIERCING_LIGHT, "pl")
      .hand(P1, RESONATING_STRIKE, "rs")
      .build();
    await game.p1.cast("pl", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl"]);
    await game.p1.cast("rs", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "rs"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
      await game.settle();
    }
    expect(game.locationOf("ally")).toBe("bf2"); // it moved before the damage spell resolved
    expect(game.state("ally").damage).toBe(2); // …and was still "at a battlefield", so it was hit
    expect(game.zoneOf("pl")).toBe("trash");
  });

  test("the 'same battlefield' pairing is enforced when the spell is played too: only pairs standing together are offered", async () => {
    const game = await board().build();
    const pairs = (game.p1.option("cast", "fb")?.fields.find((f) => f.name === "targets")?.options ?? []).map((o) =>
      (Array.isArray(o) ? o : [o]).map(String),
    );
    expect(pairs).toContainEqual(["ally", "foe"]);
    expect(pairs).toContainEqual(["anchor", "squatter"]);
    expect(pairs).not.toContainEqual(["ally", "squatter"]);
  });
});
