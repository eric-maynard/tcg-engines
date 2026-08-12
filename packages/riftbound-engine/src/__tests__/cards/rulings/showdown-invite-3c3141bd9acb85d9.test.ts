/**
 * Ruling 3c3141bd9acb85d9 — (no specific card) the "invite" mechanic in 3-player games
 *
 * Q: How does inviting work in a 3-player game?
 * A: During a showdown at a controlled battlefield only the attacker and the defender are Relevant Players;
 *    either of them may invite a non-relevant player, who then stays relevant for the rest of that showdown.
 *    Inviting needs priority, and outside showdowns everyone is relevant anyway.
 * Rules: 345 (the contesting player gains Focus), 347.2.b (Focus passes to the next player IN TURN ORDER),
 *        316.5.b.1 / 489.8.a (the CR's own "invite" — a teammate invitation in team modes), 332/336
 *        (priority on a chain outside a showdown). Engine: `moves/chain/invite-player.ts`.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

/** [Action] "Give a unit +1 [Might] this turn." */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const PRICK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Prick",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

/** Three players; P1's turn. P2 CONTROLS bf1 with a Guard; P1 attacks; P3 is a bystander with spells. */
function board() {
  return scenario({ players: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P3, "base", { might: 3, name: "Bystander" }, "bystander")
    .hand(P1, NUDGE, "n1")
    .hand(P3, NUDGE, "n3")
    .hand(P3, PRICK, "r3");
}

describe("Ruling 3c3141bd9acb85d9 — Relevant Players and inviting in a 3-player showdown", () => {
  test("at a CONTROLLED battlefield the showdown starts with exactly two Relevant Players: attacker and defender", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, relevantPlayers: [P1, P2] });
  });

  test("the Focus holder may invite the third player, who becomes relevant for the rest of the showdown", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.p1.option("invite")).toMatchObject({ label: "invite player-3", verb: "invite" });
    await game.p1.do("invitePlayer", { invitedPlayerId: P3 });
    expect(showdown(game)?.relevantPlayers).toEqual([P1, P2, P3]);
    // …and the invitation is one-shot: an already-relevant player cannot be invited again.
    expect(game.p1.option("invite")).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("only a Relevant Player may invite — the bystander cannot invite themselves in, and inviting needs the priority to act", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.seat(P3).option("invite")).toBeUndefined();
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p2.option("invite")).toMatchObject({ verb: "invite" }); // the defender may invite too
  });

  test("inviting does not hand over the turn to act: the inviter keeps Focus and the invited player is not forced into an immediate action", async () => {
    // RULING-CONFLICT: riftjudge 3c3141bd9acb85d9 says the invited player "must immediately make a legal
    // game action"; no Core Rule imposes that, and the engine simply adds them to the rotation — engine
    // follows CR (347.2.b: Focus moves on in turn order, nothing is compelled).
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.do("invitePlayer", { invitedPlayerId: P3 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.seat(P3).can("cast", "n3")).toBe(false); // still no Focus of their own
  });

  test("and an UNINVITED third player is not shut out: Focus reaches them in turn order and they may play an Action", async () => {
    // RULING-CONFLICT: the ruling reads as though a non-relevant player cannot act at all until invited;
    // CR 347.2.b passes Focus to the next player in turn order regardless — engine follows CR.
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P3);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P3 });
    expect(game.seat(P3).can("cast", "n3")).toBe(true);
  });

  test("the ruling's uncontested half is true as written: outside any showdown every player takes priority on a chain", async () => {
    const game = await scenario({ players: 3 })
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .unit(P3, "base", { might: 3, name: "Bystander" }, "bystander")
      .hand(P1, NUDGE, "n1")
      .hand(P3, PRICK, "r3")
      .build();
    await game.p1.cast("n1", { targets: "raider" });
    await game.p1.passPriority();
    while (game.actingSeat() !== P3) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P3 });
    expect(game.seat(P3).can("cast", "r3")).toBe(true);
  });
});
