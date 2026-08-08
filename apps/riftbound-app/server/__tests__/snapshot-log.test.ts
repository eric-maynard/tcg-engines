/**
 * Match-log narration for `resolvePendingChoice`.
 *
 * rule 424.1: revealing a card presents it to ALL players, so a pick taken out
 * of a revealed set must name that card in the shared log — the generic
 * "resolve pending choice." default hid it from the opponent.
 */

import { describe, expect, test } from "bun:test";
import { formatMoveLog } from "../snapshot";

const NAMES = { "player-1": "Dev", "player-2": "Opp" };

describe("formatMoveLog: resolvePendingChoice", () => {
  test("names the single picked card (rule 424.1)", () => {
    const text = formatMoveLog(
      "resolvePendingChoice",
      "player-1",
      { pickedCardId: "player-1-main-3-sfd-030-221", playerId: "player-1" },
      NAMES,
    );
    expect(text).toContain("Dev");
    expect(text).toContain("Skyfall of Areion");
    expect(text).not.toContain("resolve pending choice");
  });

  test("names every card of a multi-pick", () => {
    const text = formatMoveLog(
      "resolvePendingChoice",
      "player-1",
      {
        pickedCardIds: ["player-1-main-3-sfd-030-221", "player-1-main-4-sfd-009-221"],
        playerId: "player-1",
      },
      NAMES,
    );
    expect(text).toContain("Skyfall of Areion");
    expect(text).toContain("Serrated Dirk");
  });

  test("falls back to a readable line when nothing was picked", () => {
    const text = formatMoveLog(
      "resolvePendingChoice",
      "player-2",
      { accept: false, playerId: "player-2" },
      NAMES,
    );
    expect(text).toBe("Opp declined an optional effect.");
  });
});
