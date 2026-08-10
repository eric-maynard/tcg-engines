/**
 * Ruling d944aded87b38c6c — Cleave (OGN-004 → ogn-004-298) · Action · [1] — "Give a unit [Assault 3] this turn."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] — "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: Can I Cleave to save my 2-Might unit from Void Seeker during an OPEN-battlefield showdown?
 * A: No, twice over: (1) Cleave is an Action and can't be played while a chain (Void Seeker's) exists; (2) even if played
 *    (with Focus, on an empty chain), Assault only adds Might while the unit is an attacker in COMBAT — an open showdown
 *    is not combat, so the unit stays at 2 and dies to the 4 damage.
 * Rules: 340/344 (non-combat showdown when a unit enters an empty uncontrolled battlefield), Action timing (chain must be
 *        empty + Focus), 803 Assault (only while attacking).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const VOID_SEEKER = "ogn-024-298";

/** P1's turn. bf1 empty and uncontrolled. P1: Scout (2) ready in base, Cleave + [1]. P2: Void Seeker + [3][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, VOID_SEEKER, "vs");
}

/** Scout walks onto the empty bf1 → an open (non-combat) showdown with P1 holding Focus. */
async function scoutEntersOpenBattlefield(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const sd = game.gameState.interaction?.showdownStack?.at(-1);
  expect(sd).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(sd?.isCombatShowdown).not.toBe(true); // open-battlefield showdown, not combat
  expect(game.state("scout").combatRole).not.toBe("attacker");
  return game;
}

describe("Ruling d944aded87b38c6c — Cleave can't save a unit from Void Seeker in an open-battlefield showdown", () => {
  test("(1) P1 passes Focus; P2 Void Seekers the Scout → a chain exists, so P1's Cleave (an Action) is NOT legal in response; the Scout takes 4 and dies, P2 draws 1", async () => {
    const game = await scoutEntersOpenBattlefield();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "vs")).toBe(true); // Action with Focus on an empty chain: fine
    await game.p2.cast("vs", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.p1.energy()).toBe(1); // affordable …
    expect(game.p1.can("cast", "cleave")).toBe(false); // … but no Actions while a chain exists
    const r = await game.p1.try((p) => p.cast("cleave", { targets: "scout" }));
    expect(r.ok).toBe(false);
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority(); // Void Seeker resolves
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("cleave")).toBe("hand");
  });

  test("(2) even Cleaving FIRST (legal: P1 has Focus, chain empty) doesn't help: the Scout gains [Assault 3] but is not an attacker in an open showdown — still 2 Might — and Void Seeker kills it", async () => {
    const game = await scoutEntersOpenBattlefield();
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("scout").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Assault", value: 3 })]);
    expect(game.state("scout").might).toBe(2); // Assault is dormant outside combat
    // Focus moves on; P2 answers with Void Seeker.
    for (let i = 0; i < 3 && game.decision()?.seat !== P2; i++) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("vs", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
  });
});
