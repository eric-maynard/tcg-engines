/**
 * Ruling 9eeb46fbb592cdd5 — Blastcone Fae (OGN-097 → ogn-097-298) · 2 Might · [2][mind]
 *   "[Hidden] When you play me, give a unit -2 [Might] this turn, to a minimum of 1 [Might]."
 *   (× Blast Cone unl-133-219 is only name-adjacent in the ruling; not involved.)
 *
 * Q: Played from hidden, can the Fae's -2 [Might] choose a unit in an opponent's base, or only units at the battlefield
 *    where it was hidden?
 * A: From hidden it is restricted to units at THAT battlefield. Played normally (full cost) it can choose a unit anywhere.
 * Rules: 811.1.d / 811.1.d.2 (a card played from facedown may only choose players and units/gear at its battlefield),
 *        355.5 (choices made as the ability is finalized).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLASTCONE_FAE = "ogn-097-298";

/** Turn 3, P1's turn. bf1 (P1's): Anchor (P1, 4). bf2 (P2's): Far (P2, 4). P2's base: Home (4). */
function base() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 4, name: "Far" }, "far")
    .unit(P2, "base", { might: 4, name: "Home" }, "home");
}

function offered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

describe("Ruling 9eeb46fbb592cdd5 — Blastcone Fae's -2 Might: battlefield-only from hidden, anywhere when played normally", () => {
  test("from hidden at bf1 (for [0]): the play trigger asks P1 for a target and offers ONLY units at bf1 — not Far (bf2) nor Home (enemy base)", async () => {
    const game = await base().facedown(P1, "bf1", BLASTCONE_FAE, "fae").build();
    await game.p1.reveal("fae");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } }); // hidden ⇒ played for 0
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fae" } });
    expect(offered(game)).toEqual(["anchor", "fae"]);
    expect(offered(game)).not.toContain("home");
    expect(offered(game)).not.toContain("far");
    expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
    await game.p1.pick("anchor");
    await game.settle();
    expect(game.state("anchor")).toMatchObject({ might: 2, mightModifier: -2 });
    expect(game.state("home").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("played normally from hand to base for [2][mind]: the same trigger may choose a unit anywhere — Home in the enemy base takes -2", async () => {
    const game = await base().hand(P1, BLASTCONE_FAE, "fae").build();
    await game.p1.play("fae", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    if (game.decision()?.kind !== "pick") {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fae" } });
    expect(offered(game)).toEqual(expect.arrayContaining(["anchor", "far", "home"]));
    await game.p1.pick("home");
    await game.settle();
    expect(game.state("home")).toMatchObject({ might: 2, mightModifier: -2 });
    expect(game.zoneOf("fae")).toBe("base");
    await game.advanceTurn();
    expect(game.state("home").might).toBe(4); // this turn only
  });
});
