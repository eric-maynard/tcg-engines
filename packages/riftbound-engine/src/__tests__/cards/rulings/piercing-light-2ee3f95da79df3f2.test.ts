/**
 * Ruling 2ee3f95da79df3f2 — Piercing Light (SFD-023 → sfd-023-221) · Spell · Fury · [2][fury]
 *     "[Repeat] [2][fury] … Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · "Move up to 2 friendly units to base."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Piercing Light is played with Repeat at two units; one of them is Flashed away in response. Does the other
 *    target still take its damage and die?
 * A: Yes. A repeated spell is ONE spell whose text is performed twice; all targets are chosen when it is finalized.
 *    A target that is no longer valid when its damage resolves is simply skipped, the still-valid one takes its
 *    damage. (And a Defy on the repeated spell counters both executions, because it is one spell.)
 * Rules: 820.1.d / 820.2 (Repeat = same chain item executed again, choices made on play), 359.3.e.5 / 359.3.e.9
 *        (a "unit at a battlefield" moved to base mistargets; other targets unaffected), 425.1 (countered spell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const FLASH = "ogs-011-024";
const DEFY = "ogn-045-298";

/**
 * P1's turn with exactly base + repeat ([4] + 2 fury). P2 holds bf1 with X and Y (2 Might each) and has Flash ([2]) and
 * Defy ([1][calm]) in hand with resources for either one.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "X" }, "X")
    .unit(P2, "bf1", { might: 2, name: "Y" }, "Y")
    .hand(P1, PIERCING_LIGHT, "pl")
    .hand(P2, FLASH, "flash")
    .hand(P2, DEFY, "defy");
}

/** P1 plays Piercing Light with Repeat: first slot X ("a unit at a battlefield"), second slot Y ("up to one other unit"). */
async function castRepeatedAtXAndY(game: Game): Promise<void> {
  await game.p1.cast("pl", { repeat: 1, targets: ["X", "Y"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // base AND repeat paid on play
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", targets: ["X", "Y"], triggered: false })]); // ONE item
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 2ee3f95da79df3f2 — repeated Piercing Light is one spell; a Flashed-away target doesn't save the other", () => {
  test("control: unopposed, both executions hit both chosen units — X and Y each take 2+2 and die", async () => {
    const game = await board().build();
    await castRepeatedAtXAndY(game);
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("Y")).toBe("trash");
  });

  test("P2 Flashes X to base in response (LIFO: Flash resolves first) — Y is still a valid target, takes its damage and DIES", async () => {
    const game = await board().build();
    await castRepeatedAtXAndY(game);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["X"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "flash"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash"); // resolved (not countered) — one spell, both executions performed
    expect(game.zoneOf("Y")).toBe("trash");
    expect(game.p2.trash()).toContain("Y");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…while X, now in base, no longer meets 'a unit at a battlefield' and is unaffected (359.3.e.9): 0 damage, alive in base", async () => {
    const game = await board().build();
    await castRepeatedAtXAndY(game);
    await game.p2.cast("flash", { targets: ["X"] });
    await game.settle();
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("X").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Defy on the repeated spell counters the WHOLE thing (one spell): neither execution happens, X and Y untouched", async () => {
    const game = await board().build();
    await castRepeatedAtXAndY(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "pl" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("Y")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing refunded
  });
});
