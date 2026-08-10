/**
 * Ruling e5b87d7fd330068e — The List (UNL-138 → unl-138-219) · Gear · [1]
 *     "As you play this, name a tag. [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *   × Prodigal Explorer (SFD-199 → sfd-199-221, Ezreal legend)
 *     "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units and/or gear twice this turn with spells or unit abilities."
 *
 * Q: Does activating The List (choosing an enemy unit) count towards Ezreal's "chosen twice" requirement?
 * A: No. The List is a GEAR; Ezreal counts choices made with spells or UNIT abilities only. A gear ability's choice does
 *    not contribute, even though it does choose a target.
 * Rules: 145 (unit abilities) vs 150 (gear abilities), 355.5 (choosing), legend condition text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const PRODIGAL_EXPLORER = "sfd-199-221";
/** A 1-cost spell that chooses a unit — each cast at an enemy is one qualifying "spell" choice. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Poke",
  timing: "action",
} as const;

/** P1's turn: Ezreal legend ready, The List + two Pokes in hand, [3]. P2 has a 6-Might Poro-tagged Brute in base. */
function board() {
  return scenario()
    .legend(P1, PRODIGAL_EXPLORER, "ez")
    .resources(P1, { energy: 3 })
    .unit(P2, "base", { might: 6, name: "Big Poro", tags: ["Poro"] }, "poro")
    .hand(P1, THE_LIST, "list")
    .hand(P1, POKE, "poke1")
    .hand(P1, POKE, "poke2");
}

/** Play The List naming "Poro" (ready, in base). */
async function listInPlay(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("list");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Poro");
  await game.settle();
  expect(game.zoneOf("list")).toBe("base");
  expect(game.state("list").meta.namedTag).toBe("Poro");
  expect(game.state("list").isReady).toBe(true);
  expect(game.p1.energy()).toBe(2);
  return game;
}

const ezUsable = (game: Game) => game.p1.can("activateAbility:ez#0") || game.p1.legal().some((o) => o.card === "ez");

describe("Ruling e5b87d7fd330068e — The List's gear ability does not count for Prodigal Explorer's 'chosen twice with spells or unit abilities'", () => {
  test("The List's [Exhaust] does choose the enemy Poro (−2 this turn) — yet after it plus ONE spell choice (Poke) the legend is still NOT usable: only one qualifying choice was made", async () => {
    const game = await listInPlay();
    expect(ezUsable(game)).toBe(false);
    await game.p1.activate("list", 1, { targets: "poro" });
    await game.settle();
    expect(game.state("list").isExhausted).toBe(true);
    expect(game.state("poro").might).toBe(4); // the gear ability really chose and affected the enemy unit
    expect(ezUsable(game)).toBe(false); // a gear choice alone: 0 qualifying
    await game.p1.cast("poke1", { targets: "poro" });
    expect(ezUsable(game)).toBe(false); // gear + 1 spell = 1 qualifying, not 2
    await game.settle();
    expect(game.state("poro").damage).toBe(1);
    expect(ezUsable(game)).toBe(false);
    expect(game.state("ez").isReady).toBe(true);
  });

  test("control: a SECOND spell choice at the enemy (Poke again) is the second qualifying choice — now the legend can be exhausted to draw 1", async () => {
    const game = await listInPlay();
    await game.p1.activate("list", 1, { targets: "poro" });
    await game.settle();
    await game.p1.cast("poke1", { targets: "poro" });
    await game.settle();
    expect(ezUsable(game)).toBe(false);
    await game.p1.cast("poke2", { targets: "poro" });
    expect(ezUsable(game)).toBe(true); // usable at once (Reaction), the spell still on the chain
    const hand0 = game.p1.hand().length;
    await game.p1.activate("ez", 0);
    expect(game.state("ez").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.state("poro").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
