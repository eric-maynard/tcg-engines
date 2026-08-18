/**
 * [rule:ui-staged-movement] A movement drag declares a mover; the commit sends
 * ONE action.
 *
 * The bug this exists for: sending two units to a battlefield by dragging one
 * then the other cannot work, because the first drag is a complete move — it
 * applies Contested, opens the showdown (190.3.a.1) and fires attacker/defender
 * triggers — so the second unit has nothing to join. Rule 144.3 wants both
 * declared as one action. Staging makes that the natural gesture instead of a
 * button the player had to find first.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/staged-movement.test.ts
 */

import { afterEach, expect, test } from "bun:test";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { launchTest } from "./_live";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

describeLive("staged movement", () => {
  test(
    "assembles a two-unit bundle in the page and commits it as a single move",
    async () => {
      live = await launchTest(BASE_URL);
      const page = live.backend.page;

      const wired = await page.evaluate(`(() => ({
        staging: typeof MoveStaging === "object",
        stage: typeof stageMovementDrop === "function",
        commit: typeof commitStagedMove === "function",
        bar: typeof renderStagedMoveBar === "function",
      }))()`);
      expect(wired).toEqual({ staging: true, stage: true, commit: true, bar: true });

      // Drive the pure staging API with an enumeration shaped like the engine's
      // (which really does offer ["u1"], ["u2"] and ["u1","u2"] — verified
      // against scenario() with two units in base and a neutral battlefield).
      const result = await page.evaluate(`(() => {
        const MOVES = [
          { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u1"] } },
          { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u2"] } },
          { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u1", "u2"] } },
        ];
        let s = MoveStaging.empty();
        s = MoveStaging.add(MOVES, s, "u1", "bf1").staged;
        const afterFirst = s.unitIds.slice();
        s = MoveStaging.add(MOVES, s, "u2", "bf1").staged;
        const committed = MoveStaging.commitMove(MOVES, s);
        return {
          afterFirst,
          bundle: s.unitIds,
          committedUnits: committed && committed.params.unitIds,
          label: MoveStaging.label(s),
        };
      })()`);

      expect(result).toEqual({
        afterFirst: ["u1"],
        bundle: ["u1", "u2"],
        committedUnits: ["u1", "u2"],
        label: "Attack with 2 units",
      });

      // The commit bar appears only once something is staged.
      const bar = await page.evaluate(`(() => {
        clearStagedMove();
        const before = Boolean(document.getElementById("stagedMoveBar"));
        return { before };
      })()`);
      expect(bar).toEqual({ before: false });
    },
    LIVE_TIMEOUT,
  );
});
