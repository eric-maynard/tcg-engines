/**
 * Ruling c2b2f543068767d7 — Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield
 *   "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *
 * Q: Can you conquer Sigil of the Storm if you have no runes to recycle?
 * A: Yes. You conquer and score the point; the trigger goes on the chain and resolves, but with no runes it
 *    simply does nothing. Because the errata'd "must" wording does not CHOOSE a rune, the rune is picked as
 *    the ability RESOLVES, not when it triggers.
 * Rules: 355.10.d (a "must" instruction without a choice is programmatic — nothing is targeted),
 *        359.3 (an instruction that finds nothing does nothing; the ability still resolves), 471 (conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SIGIL_OF_THE_STORM = "ogn-287-298";

/** P1's turn: an uncontrolled, empty Sigil of the Storm with its printed text live, and a Scout in base. */
function board() {
  return scenario()
    .battlefield("sigil", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout");
}

/** Close the non-combat showdown by passing Focus until a real prompt (or the open main phase) appears. */
async function untilPrompt(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling c2b2f543068767d7 — conquering Sigil of the Storm with no runes is legal and simply does nothing", () => {
  test("ruling: with ZERO runes the Scout still conquers and P1 still scores the point", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("scout", "sigil");
    await game.settle();
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("ruling: no prompt is raised and nothing is recycled — the effect resolves with nothing to find", async () => {
    const game = await board().build();
    await game.p1.move("scout", "sigil");
    await game.settle();
    expect(game.p1.runes()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with runes available, the rune is chosen as the ability RESOLVES (it does not choose one at trigger time)", async () => {
    const game = await board().rune(P1, "fury", { alias: "r1" }).rune(P1, "chaos", { alias: "r2" }).build();
    await game.p1.move("scout", "sigil");
    await untilPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RES", source: { cardId: "sigil" } });
    expect((d as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["r1", "r2"]);
    expect((d as { allowDecline: boolean }).allowDecline).toBe(false); // "must"
  });

  test("ruling: answering it recycles exactly one rune; the point is still scored", async () => {
    const game = await board().rune(P1, "fury", { alias: "r1" }).rune(P1, "chaos", { alias: "r2" }).build();
    await game.p1.move("scout", "sigil");
    await untilPrompt(game);
    await game.p1.pick("r1");
    await game.settle();
    expect(game.p1.runes()).toEqual(["r2"]);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
  });
});
