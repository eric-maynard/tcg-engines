/**
 * Interaction: Ruin Runner (sfd-105-221) "I can't be chosen by enemy spells and abilities."
 *   × Discipline (ogn-058-298) "Give a unit +2 [Might] this turn. Draw 1."   — any unit
 *   × En Garde  (ogn-046-298) "Give a friendly unit +1 [Might] this turn…"   — friendly only
 *
 * Rule 757 (can't be chosen): restriction is relative to the chooser — the Runner's own
 * controller may still choose it. Rule 355.5: targets are chosen at play time, so an
 * illegal target must not even be offered.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUIN_RUNNER = "sfd-105-221";
const DISCIPLINE = "ogn-058-298";
const EN_GARDE = "ogn-046-298";

/** Flatten the `targets` field of the cast option into the set of card ids offered. */
function targetsOffered(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUIN_RUNNER, "myRunner")
    .unit(P2, "bf1", RUIN_RUNNER, "theirRunner")
    .unit(P2, "bf1", { might: 2 }, "theirGrunt")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, EN_GARDE, "enGarde");
}

describe("Ruin Runner × Discipline / En Garde targeting", () => {
  test("Discipline CAN target your own Ruin Runner (+2 Might, draw 1)", async () => {
    const game = await board().build();
    const before = game.state("myRunner").might;
    const hand = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "myRunner" });
    await game.settle();
    expect(game.state("myRunner").might).toBe(before + 2);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // spent Discipline, drew 1
  });

  test.failing("BUG: Discipline offers the ENEMY Ruin Runner as a target — 'can't be chosen by enemy spells' (rule 757) not enforced at target enumeration", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "discipline");
    expect(offered).toContain(game.card("myRunner"));
    expect(offered).toContain(game.card("theirGrunt")); // ordinary enemy unit is fine
    expect(offered).not.toContain(game.card("theirRunner"));
    await expect(game.p1.cast("discipline", { targets: "theirRunner" })).rejects.toThrow();
  });

  test("Discipline CAN target an ordinary enemy unit (it says 'a unit')", async () => {
    const game = await board().build();
    const before = game.state("theirGrunt").might;
    await game.p1.cast("discipline", { targets: "theirGrunt" });
    await game.settle();
    expect(game.state("theirGrunt").might).toBe(before + 2);
  });

  test("En Garde only offers FRIENDLY units — no enemy unit (Runner or otherwise) is targetable", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "enGarde");
    expect(offered).toContain(game.card("myRunner"));
    expect(offered).not.toContain(game.card("theirRunner"));
    expect(offered).not.toContain(game.card("theirGrunt"));
    await expect(game.p1.cast("enGarde", { targets: "theirGrunt" })).rejects.toThrow();
  });

  test.failing("BUG: En Garde grants the extra +1 even when you control another unit there — 'only unit you control there' condition ignored", async () => {
    const game = await board().build(); // myRunner is P1's only unit at bf1
    const before = game.state("myRunner").might;
    await game.p1.cast("enGarde", { targets: "myRunner" });
    await game.settle();
    expect(game.state("myRunner").might).toBe(before + 2);

    const crowded = await board().unit(P1, "bf1", { might: 1 }, "buddy").build();
    const b2 = crowded.state("myRunner").might;
    await crowded.p1.cast("enGarde", { targets: "myRunner" });
    await crowded.settle();
    expect(crowded.state("myRunner").might).toBe(b2 + 1);
  });
});
