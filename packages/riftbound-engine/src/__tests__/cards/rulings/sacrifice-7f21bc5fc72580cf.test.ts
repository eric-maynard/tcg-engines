/**
 * Ruling 7f21bc5fc72580cf — Sacrifice (UNL-173 → unl-173-219) · Reaction · [1] · "As an additional cost to play this, kill a friendly
 *   [Mighty] unit. Draw 2 and channel 1 rune exhausted."   × Tactical Retreat (UNL-175 → unl-175-219) · Reaction · [2] · "Choose a
 *   friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead."   (Retreat ogn-104 cited only.)
 *
 * Q: I Sacrifice a Mighty unit and "save" it with Tactical Retreat — do I still draw 2?
 * A: Yes. The kill is Sacrifice's COST; Tactical Retreat's replacement turns that kill into heal + exhaust + recall, and a replaced
 *    cost still counts as paid (357.2.a). Sacrifice resolves: draw 2, channel 1 rune exhausted; the unit survives in base.
 * Rules: 357.2.a (replaced costs are paid), 366–373 (replacement effects), 355.10.c (a cost is not a target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const TACTICAL_RETREAT = "unl-175-219";

/** P1's turn 3 with [3] + [order]. P1: a damaged 5-Might Brute (Mighty) at its bf1 and a 2-Might Small in base. Known deck top. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Brute" }, "brute", { damage: 1 })
    .unit(P1, "base", { might: 2, name: "Small" }, "small") // not Mighty: never a legal payment
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, TACTICAL_RETREAT, "retreat")
    .hand(P1, SACRIFICE, "sac")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Tactical Retreat on the Brute first (resolved), so its one-shot replacement is armed. */
async function retreatArmed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("retreat", { targets: "brute" });
  await game.settle();
  expect(game.zoneOf("retreat")).toBe("trash");
  expect(game.p1.energy()).toBe(1);
  expect(game.state("brute")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
  return game;
}

describe("Ruling 7f21bc5fc72580cf — Sacrifice a Tactical-Retreat-protected Mighty unit: it lives AND you draw 2", () => {
  test("step 1: only the Mighty Brute (5) is offered for Sacrifice's kill cost — the 2-Might Small is not", async () => {
    const game = await retreatArmed();
    expect(game.p1.can("cast", "sac")).toBe(true);
    const field = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice");
    expect(field?.options).toEqual(["brute"]);
  });

  test("steps 2–4: paying the cost 'kills' the Brute but the replacement intercedes — healed (1 → 0), exhausted, recalled to base, NOT in trash — and the cost counts as paid: Sacrifice is on the chain with its [1] spent", async () => {
    const game = await retreatArmed();
    await game.p1.cast("sac", { sacrifice: "brute" });
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute")).toMatchObject({ damage: 0, isExhausted: true, might: 5 });
    expect(game.p1.trash()).not.toContain("brute");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1 })]);
    expect(game.p1.energy()).toBe(0);
  });

  test("step 5: Sacrifice resolves — P1 draws 2 and channels 1 rune exhausted; the Brute is still alive in base", async () => {
    const game = await retreatArmed();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "brute" });
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Tactical Retreat the same play really kills the Brute (trash) and draws 2 all the same", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    expect(game.zoneOf("brute")).toBe("trash");
    await game.settle();
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2", "retreat"]);
  });
});
