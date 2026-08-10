/**
 * Ruling eec5bf00b23678ce — Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Karthus, Eternal (ogn-236-298) 3 Might "Your [Deathknell] effects trigger an additional time."
 *   × LeBlanc, Everywhere at Once (unl-090-219) 4 Might "[Backline] … Your [Temporary] effects at my battlefield don't trigger." (no Deathknell)
 *   × Soaring Scout (ogn-216-298) "[Deathknell] — Channel 1 rune exhausted." (a unit that DOES have a Deathknell, for the "counts" case)
 *
 * Q: Karthus and LeBlanc both die to one Falling Star — does Karthus' effect count?
 * A: Yes: Karthus' ability is passive and still applies to any Deathknell created by units dying simultaneously with him.
 *    But it only modifies Deathknells — the retrieved LeBlanc has none, so with just Karthus + LeBlanc dying nothing
 *    triggers at all; a Deathknell unit dying alongside Karthus would trigger twice.
 * Rules: 808 (Deathknell), 376 (passives), 323.4/323.5 (simultaneous deaths in one Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const KARTHUS = "ogn-236-298";
const LEBLANC = "unl-090-219";
const SOARING_SCOUT = "ogn-216-298";

/** P2's turn with exactly 2+[fury][fury]; P1's Karthus (3) and `other` in P1's base (LeBlanc pre-damaged 1 so 3 is lethal on her 4). */
function board(other: string, meta?: { damage?: number }) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", other, "other", meta)
    .hand(P2, FALLING_STAR, "star");
}

async function starKillsBoth(game: Game): Promise<void> {
  await game.p2.cast("star", { targets: ["karthus", "other"] });
  await game.p2.passPriority();
  await game.p1.passPriority();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("star")).toBe("trash");
  expect(game.zoneOf("karthus")).toBe("trash");
  expect(game.zoneOf("other")).toBe("trash");
}

describe("Ruling eec5bf00b23678ce — Karthus' passive counts for simultaneous deaths, but only for units that HAVE a Deathknell", () => {
  test("Karthus + LeBlanc, Everywhere at Once die together: LeBlanc has no Deathknell, so there is simply nothing to double — no triggered item at all, P1's runes unchanged, straight back to P2's main phase", async () => {
    const game = await board(LEBLANC, { damage: 1 }).build();
    expect(game.state("other").keywords).not.toContain("Deathknell");
    const runes = game.p1.runes().length;
    await starKillsBoth(game);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("Karthus + a Deathknell unit (Soaring Scout) die together: Karthus' passive still applies at that moment — the Scout's Deathknell is created TWICE and P1 channels 2 exhausted runes", async () => {
    const game = await board(SOARING_SCOUT).build();
    const runes = game.p1.runes().length;
    const exhausted = game.p1.runes({ ready: false }).length;
    await starKillsBoth(game);
    const items = game.chain().filter((c) => c.cardId === "other" && c.triggered);
    expect(items).toHaveLength(2);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runes + 2);
    expect(game.p1.runes({ ready: false })).toHaveLength(exhausted + 2);
  });

  test("contrast — Karthus already dead BEFORE the Scout dies (Star kills only Karthus; a later 3 kills the Scout) — his passive is gone: one trigger, one rune", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 4, power: { fury: 4 } })
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P1, "base", SOARING_SCOUT, "scout")
      .unit(P1, "base", { might: 9, name: "Wall" }, "wall")
      .hand(P2, FALLING_STAR, "star1")
      .hand(P2, FALLING_STAR, "star2")
      .build();
    const runes = game.p1.runes().length;
    await game.p2.cast("star1", { targets: ["karthus", "wall"] });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("base");
    await game.p2.cast("star2", { targets: ["scout", "wall"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().filter((c) => c.cardId === "scout" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runes + 1);
  });
});
