/**
 * Ruling 8268edd613173038 — Tricksy Tentacles (UNL-054 → unl-054-219) · Spell · Calm · 4 + [calm]
 *     "Move any number of enemy units with the same controller and a total Might of 8 or less to a single location."
 *   × Discipline (ogn-058-298) · Reaction · 2 + [calm] — "Give a unit +2 [Might] this turn. Draw 1." (the opponent's response)
 *
 * Q: Do I declare Tricksy Tentacles' targets when I play it, or only on resolution?
 * A: When you FINALIZE it onto the chain: the enemy units (targets, total Might ≤ 8 checked then) AND the destination
 *    location are declared before anyone can react. On resolution the targets are re-checked; if a reaction pushed the
 *    group's total over 8 you pick a subset of the ORIGINAL targets that still fits.
 * Rules: 355.7 / 355.8 (targets chosen and validated to put the spell on the chain), 355.4 (move destinations are a
 *        play-time choice), 359.3.e (legality re-checked on resolution), 355.11.b (aggregate cap → subset of originals).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRICKSY = "unl-054-219";
const DISCIPLINE = "ogn-058-298";

/** P1's turn: 4 + [calm], Tricksy in hand. P2 holds bf1 with Four (4), Three (3), Five (5); bf2 is P1's (Holder 6). P2: Discipline + 2 + [calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
    .unit(P1, "bf2", { might: 6, name: "Holder" }, "holder")
    .hand(P1, TRICKSY, "tt")
    .hand(P2, DISCIPLINE, "disc");
}

/** Legal `targets` tuples offered for the cast, normalised to "a+b" strings. */
function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "tt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

/** Cast at {Four, Three} (7 ≤ 8) and answer the finalization-time destination prompt with P2's base. */
async function castFourThreeToBase(game: Game): Promise<void> {
  await game.p1.cast("tt", { targets: ["four", "three"] });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick("base");
}

describe("Ruling 8268edd613173038 — Tricksy Tentacles: targets AND destination are locked in at finalization, before any reaction", () => {
  test("initialization/finalization: the legal target SETS are computed as you play it (total ≤ 8 now) — {Four,Three}=7 and {Five,Three}=8 offered, {Four,Five}=9 not, and an over-cap set is refused outright", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toEqual(expect.arrayContaining(["four+three", "five+three", "four", "three", "five"]));
    expect(sets).not.toContain("five+four");
    expect((await game.p1.try((p) => p.cast("tt", { targets: ["four", "five"] }))).ok).toBe(false);
    expect(game.zoneOf("tt")).toBe("hand");
  });

  test("the destination is ALSO asked right away — a FIN-timed destination pick for P1 while the spell is being finalized, before P2 has had priority", async () => {
    const game = await board().build();
    await game.p1.cast("tt", { targets: ["four", "three"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["base", "battlefield-bf2"]));
    expect(game.zoneOf("four")).toBe("battlefield-bf1"); // nothing moves yet
  });

  test("once finalized the chain item publicly carries the chosen units; only THEN does priority pass (P1, then P2 may react) — nothing has moved", async () => {
    const game = await board().build();
    await castFourThreeToBase(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", controller: P1 })]);
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["four", "three"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect([...(game.p2.view().chain[0]?.targets ?? [])].sort()).toEqual(["four", "three"]);
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.locationOf("four")).toBe("bf1");
    expect(game.locationOf("three")).toBe("bf1");
  });

  test("no reaction: on resolution the still-legal targets move together to the pre-chosen location (P2's base) — no further destination question; Five stays", async () => {
    const game = await board().build();
    await castFourThreeToBase(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind === "pick" ? (game.decision() as { semantics?: string }).semantics : undefined).not.toBe("destination");
    await game.settle();
    expect(game.locationOf("four")).toBe("base");
    expect(game.locationOf("three")).toBe("base");
    expect(game.locationOf("five")).toBe("bf1");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // BUG: expected (ruling step 5 / CR 355.11.b) — with the bound group now totalling 9 (> 8) the spell still resolves but
  // P1 must re-pick a subset of the ORIGINAL targets that fits (like the engine already does for Fox-Fire's kill cap).
  // Actual: effects/move.ts performs no aggregate re-check — both Four (4) and the pumped Three (5) are moved to base.
  test("ruling 8268edd613173038 — subset re-pick under the 355.11.b aggregate cap. Reaction changes Might: P2 Disciplines Three (+2 → group total 9 > 8); on resolution P1 must choose a SUBSET of the ORIGINAL targets that fits — Five is never offered; picking Four moves only Four", async () => {
    const game = await board().build();
    await castFourThreeToBase(game);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "three" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves: Three is 5
    expect(game.state("three").might).toBe(5);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tricksy resolves → re-check
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "subset" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["four", "three"]);
    expect(offered).not.toContain("five");
    await game.p1.pick("four");
    await game.settle();
    expect(game.locationOf("four")).toBe("base");
    expect(game.locationOf("three")).toBe("bf1");
    expect(game.locationOf("five")).toBe("bf1");
    expect(game.zoneOf("tt")).toBe("trash");
  });
});
