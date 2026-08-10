/**
 * Ruling 8f82d123598945f8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] calm · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Tasty Faefolk (ogn-075-298) · 6 Might · "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q (CR 1.2): my lone Tasty Faefolk dies in a combat at the battlefield where my Zhonya's is hidden. Can I flip Zhonya's in
 *    response to Tasty's Deathknell trigger before I lose control of the battlefield?
 * A: Yes. Combat cleanup happens, the Deathknell triggers, priority is awarded (flip Zhonya's here), and only afterwards is
 *    control of the battlefield lost. Flipping saves the HOURGLASS (it is in play in base instead of being trashed with the
 *    lost battlefield) — it does NOT save Tasty, which has already died. (Nothing changed vs CR 1.1; 1.2 only clarified that
 *    loss of control is not part of the combat cleanup.)
 * Rules: 466.1 (Combat Cleanup) → 808 (Deathknell pending → chain, priority) → 466.5 / 190.4 (control settled after), 811
 *        (hidden ⇒ may be played as a Reaction for [0]), 323.7 / 466.5.c (facedown card at a battlefield you no longer control
 *        is trashed), 366–371 (a replacement must exist before the event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const TASTY_FAEFOLK = "ogn-075-298";

/** P2's turn 3. P1 controls bf1 with a lone Tasty Faefolk (6) and Zhonya's facedown there; P2's Brute (7) is ready in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TASTY_FAEFOLK, "tasty")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Brute attacks; both pass Focus; combat damage: Tasty (6) dies to 7. Stop with the Deathknell on the chain. */
async function tastyDiesInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("tasty")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tasty", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 8f82d123598945f8 — Deathknell first, priority next, loss of control last: the hidden Zhonya's can be flipped in that window", () => {
  test("sequence: after the combat cleanup Tasty is dead and its Deathknell is on the chain; P1 has PRIORITY; bf1 is still P1's (control not yet lost) and the facedown Zhonya's is still there and playable", async () => {
    const game = await tastyDiesInCombat();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
  });

  test("flipping it there (for [0]) puts the Hourglass into play in P1's base — it is SAVED from the trash — but Tasty stays dead (already died; nothing to replace); the Deathknell pays out; THEN P2 takes bf1", async () => {
    const game = await tastyDiesInCombat();
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p1.reveal("zhonya");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("base"); // in play, not trashed
    expect(game.p1.gear()).toContain("zhonya");
    expect(game.zoneOf("tasty")).toBe("trash"); // not healed / recalled
    expect(game.p1.base()).not.toContain("tasty");
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // Deathknell: draw 1 …
    expect(game.p1.runes()).toHaveLength(runes0 + 2); // … and channel 2 exhausted
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 }); // loss of control came last
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — NOT flipping: once the chain empties and P2's conquest settles control, the still-facedown Zhonya's at the lost battlefield is put in P1's trash", async () => {
    const game = await tastyDiesInCombat();
    await game.p1.passPriority();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["tasty", "zhonya"]));
  });

  test("contrast — to actually save Tasty, Zhonya's must be flipped BEFORE the damage (during the showdown, while P1 has Focus): then Zhonya's dies instead, Tasty is recalled exhausted, and there is no Deathknell", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.state("tasty")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.hand()).toHaveLength(hand0); // no Deathknell draw
    expect(bf1(game)?.controller).toBe(P2);
  });
});
