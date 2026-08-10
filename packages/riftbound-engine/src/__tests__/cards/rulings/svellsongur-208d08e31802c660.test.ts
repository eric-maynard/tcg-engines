/**
 * Ruling 208d08e31802c660 — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [3]+[calm] · +0
 *     "[Equip] [1][calm] As this is attached to a unit, copy that unit's text to this Equipment's effect text …"
 *   × Caitlyn, Patrolling (OGN-068 → ogn-068-298) · Champion · 3 Might · "I must be assigned combat damage last.
 *     [Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use this ability only while I'm at a
 *     battlefield."
 *
 * Q: Does Svellsongur let Caitlyn use her activated ability twice?
 * A: Effectively no. Svellsongur gives her a second, separate copy of the ability, but each copy costs [Exhaust]
 *    Caitlyn; after paying for one she is exhausted and the other copy can no longer be activated.
 * Rules: 377 (activated abilities: put on chain, then pay costs), 402.3 (Exhaust cost needs a ready permanent),
 *        718 / Svellsongur copy text (each copy is its own ability).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";
const SVELLSONGUR = "sfd-059-221";

/** P1's turn. Ready Caitlyn (3) holds bf1; P2's Foe (7) holds bf2. Svellsongur loose in P1's base with exactly its Equip cost [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CAITLYN, "cait")
    .unit(P2, "bf2", { might: 7, name: "Foe" }, "foe")
    .gear(P1, SVELLSONGUR, "svell");
}

/** Equip Svellsongur onto Caitlyn and let the [Equip] activation resolve. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "cait" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("svell").attachedTo).toBe("cait");
  expect(game.state("svell").meta.copiedFromCardId).toBe("cait"); // text copied
  expect(game.state("cait")).toMatchObject({ isReady: true, might: 3 });
  return game;
}

const activations = (game: Game) => game.p1.legal().filter((o) => o.verb === "activate").map((o) => o.key).sort();

describe("Ruling 208d08e31802c660 — Svellsongur's copy of Caitlyn's [Exhaust] ability can't be used on top of the original", () => {
  test("with Svellsongur attached, Caitlyn's controller sees TWO separate activated abilities: Caitlyn's own and Svellsongur's copy (sourced from Caitlyn)", async () => {
    const game = await equipped();
    expect(activations(game)).toEqual(["activateAbility:cait#1", "activateAbility:svell#1"]);
    const copy = game.p1.option("activateAbility:svell#1");
    expect(copy?.fields.find((f) => f.arg === "source")?.options).toEqual(["cait"]);
  });

  test("activating Caitlyn's own copy exhausts her as the cost → the Svellsongur copy is immediately no longer activatable; the one activation deals 3 (her Might) to the Foe", async () => {
    const game = await equipped();
    await game.p1.activate("cait", 1, { targets: "foe" });
    expect(game.state("cait").isExhausted).toBe(true); // cost paid
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cait", controller: P1 })]);
    expect(activations(game)).toEqual([]); // neither copy can be activated now (she can't be exhausted twice)
    expect(game.p1.can("activateAbility:svell#1")).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("foe")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    // Back in the open main phase: still exhausted, still nothing to activate.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(activations(game)).toEqual([]);
    const again = await game.p1.try((p) => p.activate("svell", 1, { source: "cait", targets: "foe" }));
    expect(again.ok).toBe(false);
    expect(game.state("foe").damage).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("symmetrically, using Svellsongur's copy first exhausts Caitlyn (its cost) and locks out her printed copy — only one activation ever reaches the chain", async () => {
    const game = await equipped();
    await game.p1.activate("svell", 1, { source: "cait", targets: "foe" });
    expect(game.state("cait").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activateAbility:cait#1")).toBe(false);
    expect(activations(game)).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(activations(game)).toEqual([]);
    const again = await game.p1.try((p) => p.activate("cait", 1, { targets: "foe" }));
    expect(again.ok).toBe(false);
  });

  // rule 718.3 — an attached card's Effect Text abilities are appended to the TOP-MOST card's Rules Text, so
  // Svellsongur's copy reads "my Might" as the equipped unit's: the copy also deals 3 to the Foe.
  test("ruling 208d08e31802c660 — Svellsongur's copy of Caitlyn's ability deals her Might (3)", async () => {
    const game = await equipped();
    await game.p1.activate("svell", 1, { source: "cait", targets: "foe" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("foe").damage).toBe(3);
  });
});
