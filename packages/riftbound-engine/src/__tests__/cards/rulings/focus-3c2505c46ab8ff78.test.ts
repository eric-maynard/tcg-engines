/**
 * Ruling 3c2505c46ab8ff78 — (Focus rotation inside a showdown; no specific card)
 *   Stand-in: Rune Prison (OGN-050 → ogn-050-298) · [Action] · 2+[calm] "Stun a unit." — the attacker's
 *   action spell.
 *
 * Q: During my attack I use Focus to play an action spell; the defender then gets Focus and plays nothing.
 *    Do I get Focus back?
 * A: Yes. Focus keeps alternating: after your spell resolves the defender has it, and a single pass hands it
 *    straight back to you. The showdown only ends once every player passes Focus in succession.
 * Rules: 347 (the player with Focus may start a chain; Focus alternates), 348.1 (a showdown ends when all
 *        players pass Focus consecutively), 332/336 (priority on a chain is separate from Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";

/** P1's turn. P2 holds bf1 with a Warden (4); P1 attacks with a Raider (4) and holds Rune Prison + [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RUNE_PRISON, "prison");
}

/** P1 attacks and, holding Focus, plays Rune Prison on the Warden; both players let it resolve. */
async function spellResolvedInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 }); // the attacker has Focus
  await game.p1.cast("prison", { targets: "warden" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["prison"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
  await game.p2.passPriority(); // chain resolves
  expect(game.zoneOf("prison")).toBe("trash");
  expect(game.state("warden").isStunned).toBe(true);
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 3c2505c46ab8ff78 — Focus alternates until BOTH players pass in succession", () => {
  test("after my spell resolves the defender holds Focus — the showdown is still open, not over", async () => {
    const game = await spellResolvedInShowdown();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("the defender passing Focus once hands it BACK to me — it does not end the showdown", async () => {
    const game = await spellResolvedInShowdown();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // combat has not resolved yet
  });

  test("only the SECOND consecutive pass ends it: after the defender's pass hands Focus back, my own pass completes the round and the combat resolves — the stunned Warden deals nothing and dies to my 4", async () => {
    const game = await spellResolvedInShowdown();
    await game.p2.passFocus(); // first pass
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.passFocus(); // second pass in succession ⇒ the showdown ends
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.state("raider").damage).toBe(0); // 423.1.b — the stunned defender assigned nothing
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
