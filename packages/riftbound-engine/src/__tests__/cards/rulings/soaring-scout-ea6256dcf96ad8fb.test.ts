/**
 * Ruling ea6256dcf96ad8fb — Soaring Scout (OGN-216 → ogn-216-298) · Unit · Order · 2 · 1 Might
 *     "[Deathknell] — Channel 1 rune exhausted."
 *   × Karthus, Eternal (ogn-236-298) 3 Might "Your [Deathknell] effects trigger an additional time."
 *   × Falling Star (ogn-029-298) · Spell · 2+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."   (× Viktor, Leader ogn-246-298 — contrast only)
 *
 * Q: Opponent's Falling Star kills BOTH Soaring Scout and Karthus in my base — does the Scout's Deathknell still trigger twice?
 * A: Yes. Karthus' ability is a passive, still applying at the moment both die simultaneously, so the Scout's Deathknell is
 *    created twice (channel 2 runes exhausted). A TRIGGERED "when another unit dies" ability (Viktor) leaving at the same
 *    time is different — but Karthus' passive modifies the Deathknell as it is created.
 * Rules: 808 (Deathknell), 323.4 (death triggers noted with the unit's last information), 376 (passive abilities), 359.3.e.13.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOARING_SCOUT = "ogn-216-298";
const KARTHUS = "ogn-236-298";
const FALLING_STAR = "ogn-029-298";

/** P2's turn with exactly 2+[fury][fury]. P1's Soaring Scout (1) and Karthus (3) sit in P1's base. */
function board(withKarthus = true) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", SOARING_SCOUT, "scout")
    .hand(P2, FALLING_STAR, "star");
  return withKarthus ? s.unit(P1, "base", KARTHUS, "karthus") : s.unit(P1, "base", { might: 3, name: "Bystander" }, "karthus");
}

const scoutItems = (game: Game) => game.chain().filter((c) => c.cardId === "scout" && c.triggered);

/** P2 casts Falling Star: 3 at the Scout, 3 at Karthus; both pass → it resolves. Stops right after (Deathknells finalized). */
async function starKillsBoth(game: Game): Promise<void> {
  await game.p2.cast("star", { targets: ["scout", "karthus"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("star")).toBe("trash");
}

describe("Ruling ea6256dcf96ad8fb — Karthus dying alongside the Scout still doubles the Scout's Deathknell", () => {
  test("Falling Star resolves: Scout (1) and Karthus (3) both take 3 and die in the same Cleanup", async () => {
    const game = await board().build();
    await starKillsBoth(game);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("trash");
    const hits = (game.gameState.damageLog ?? []).map((r) => [r.target, r.amount]).sort();
    expect(hits).toEqual([
      ["karthus", 3],
      ["scout", 3],
    ]);
  });

  test("the Scout's Deathknell is on the chain TWICE (Karthus' passive applied as the triggers were created), both controlled by P1", async () => {
    const game = await board().build();
    await starKillsBoth(game);
    expect(scoutItems(game)).toHaveLength(2);
    expect(scoutItems(game).every((c) => c.controller === P1)).toBe(true);
    expect(game.chain().some((c) => c.cardId === "karthus")).toBe(false); // Karthus himself has no Deathknell
  });

  test("both resolve: P1 channels 2 runes, both exhausted; then P2's turn continues in its open main phase", async () => {
    const game = await board().build();
    const runes = game.p1.runes().length;
    const exhausted = game.p1.runes({ ready: false }).length;
    await starKillsBoth(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(runes + 2);
    expect(game.p1.runes({ ready: false })).toHaveLength(exhausted + 2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Karthus (a vanilla 3-Might bystander dies instead) the Scout's Deathknell triggers once: 1 rune", async () => {
    const game = await board(false).build();
    const runes = game.p1.runes().length;
    await starKillsBoth(game);
    expect(scoutItems(game)).toHaveLength(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runes + 1);
  });
});
