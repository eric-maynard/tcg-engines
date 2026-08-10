/**
 * Ruling d754aefbaa18ff6b — Lonely Poro (SFD-036 → sfd-036-221) · Unit · Calm · 2 · 2 Might
 *     "[Deathknell] — If I died alone, draw 1."
 *   × Tideturner (OGN-199 → ogn-199-298) "[Hidden] When you play me, you may choose a unit you control at another location.
 *     Move me to its location and it to my original location."
 *
 * Q: Lonely Poro dies in combat resolution and its Deathknell triggers; I chain my hidden Tideturner (at that battlefield)
 *    to swap in a "Yasuo" from base. What happens to combat, control, the Deathknell condition and attacker/defender?
 * A: Tideturner resolves (Yasuo → battlefield, Tideturner → base); the Deathknell then resolves and DRAWS (the Poro was
 *    alone when it died). Because combat is staged again, control is not established — the battlefield stays contested;
 *    when the chain empties the current combat closes and a NEW combat opens with a showdown: the opponent is again the
 *    attacker (their on-attack triggers re-trigger) and you defend.
 * Rules: 465–467 (combat resolution; control only established with no staged combat), 460 (a staged combat opens once
 *        the chain is empty), 464.2 (designations + initial combat chain per combat), 811 (hidden play as a Reaction while
 *        you still control the battlefield), 815 (Deathknell looks back at the death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const TIDETURNER = "ogn-199-298";
const CORSAIR = "ogn-130-298"; // Crackshot Corsair (3): "When I attack, deal 1 to an enemy unit here." — a visible on-attack trigger

/**
 * P2's turn 3. P1 holds bf1 with a lone Lonely Poro and hid Tideturner there earlier; "Yasuo" (5) waits in P1's base.
 * P2 attacks with Crackshot Corsair (3). P1's deck top is known.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", TIDETURNER, "tt")
    .unit(P1, "base", { might: 5, name: "Yasuo" }, "yas")
    .unit(P2, "base", CORSAIR, "corsair")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

/** Corsair attacks; its on-attack ping (1 to the Poro) resolves; both pass focus; combat 3 vs 2 kills the lone Poro → Deathknell on the chain (CL1), P1 has priority. */
async function poroDiesAlone(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("corsair", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", targets: ["poro"], triggered: true })]);
  await passBoth(game);
  expect(game.state("poro").damage).toBe(1);
  await game.p2.passFocus();
  await game.p1.passFocus(); // combat damage: Poro dies
  for (let i = 0; i < 2 && game.decision()?.kind === "distribute"; i++) {
    const d = game.decision() as Extract<ReturnType<Game["decision"]>, { kind: "distribute" }>;
    await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
  }
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** …P1 plays the hidden Tideturner in response (CL2) and swaps with Yasuo; Tideturner's item resolves. Deathknell still pending. */
async function tideturnerSwapsYasuoIn(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "tt")).toBe(true); // bf1 is still contested/controlled by P1
  await game.p1.reveal("tt");
  expect(game.zoneOf("tt")).toBe("battlefield-bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("yas");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["poro", "tt"]);
  expect(game.chain()[1]).toMatchObject({ targets: ["yas"], triggered: true });
  await passBoth(game); // Tideturner resolves
  expect(game.locationOf("yas")).toBe("bf1");
  expect(game.locationOf("tt")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["poro"]);
}

describe("Ruling d754aefbaa18ff6b — Deathknell + hidden Tideturner during combat resolution: draw, stay contested, new combat with the same attacker", () => {
  test("the lone Poro dies in combat: its Deathknell is chain link 1 and the hidden Tideturner is playable in response (P1 still controls the contested bf1)", async () => {
    const game = await poroDiesAlone();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true);
  });

  test("Tideturner (CL2) resolves first: Yasuo moves to bf1, Tideturner goes to base; then the Deathknell resolves and P1 DRAWS 1 — the Poro was alone when it died, Yasuo arriving later doesn't change that", async () => {
    const game = await poroDiesAlone();
    await tideturnerSwapsYasuoIn(game);
    expect(game.p1.hand()).toEqual([]);
    await passBoth(game); // Deathknell
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("no control is established (combat is staged again): bf1 stays contested under P1, P2 scores nothing; once the chain is empty a NEW combat opens — Corsair is attacker again (its on-attack trigger RE-triggers, now at Yasuo) and Yasuo defends", async () => {
    const game = await poroDiesAlone();
    await tideturnerSwapsYasuoIn(game);
    await passBoth(game); // Deathknell → chain empty → old combat closes, new one opens
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("yas").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", targets: ["yas"], triggered: true })]);
    await passBoth(game); // the re-triggered ping: 1 to Yasuo
    expect(game.state("yas").damage).toBe(1);
    // full showdown with Focus windows as normal: attacker first, then defender
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    await game.settle(); // 3 vs 5: Corsair dies, P1 keeps bf1
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.zoneOf("yas")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
