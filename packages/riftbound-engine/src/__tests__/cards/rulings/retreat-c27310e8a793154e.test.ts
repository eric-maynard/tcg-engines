/**
 * Ruling c27310e8a793154e — Retreat (OGN-104 → ogn-104-298) · Spell · Mind · 1 · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Viktor, Innovator (OGN-117 → ogn-117-298) · 3 Might "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit
 *     token in your base."
 *
 * Q: On my opponent's turn I Retreat my own Viktor to hand — do I get the Recruit?
 * A: No. A card counts as "played" when it finishes resolving; by then Retreat has already put Viktor in your hand, where he
 *    cannot trigger. (Retreating a different unit does give the Recruit.)
 * Rules: 419.4.a (play triggers fire on completion of the play = resolution), 383 (a triggered ability needs its source in
 *        play when the event happens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const VIKTOR = "ogn-117-298";
/** Inline [Action] "Deal 1 to a unit." — P2's own play that opens a chain on P2's turn so P1 can React. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Ping",
  timing: "action",
} as const;

/** P2's turn. P1: Viktor + a 2-Might Pawn in base, Retreat + [1]. P2: a Raider and a Ping to cast at it. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, PING, "ping");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
const viktorItems = (game: Game) => game.chain().filter((c) => c.cardId === "viktor" && c.triggered);

/** P2 pings its own Raider; P1 gets priority and Retreats `target`. Resolves everything, reporting whether Viktor ever triggered. */
async function retreatInResponse(game: Game, target: "viktor" | "pawn"): Promise<boolean> {
  await game.p2.cast("ping", { targets: "raider" });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "retreat")).toBe(true);
  await game.p1.cast("retreat", { targets: target });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ping", "retreat"]);
  let sawViktor = false;
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    sawViktor ||= viktorItems(game).length > 0;
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  await game.settle();
  return sawViktor || viktorItems(game).length > 0;
}

describe("Ruling c27310e8a793154e — Retreating Viktor himself on the opponent's turn yields no Recruit", () => {
  test("control: Retreating the PAWN on P2's turn is 'playing a card on an opponent's turn' with Viktor on board → his trigger fires and a 1-Might Recruit token appears in P1's base", async () => {
    const game = await board().build();
    const fired = await retreatInResponse(game, "pawn");
    expect(fired).toBe(true);
    expect(game.zoneOf("pawn")).toBe("hand");
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.p1.runes()).toHaveLength(1); // "its owner channels 1 rune exhausted"
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
  });

  test("Retreat on VIKTOR: it resolves (Viktor → P1's hand, P1 channels 1 exhausted rune) and only THEN counts as played — Viktor is no longer on the board, so NO trigger and NO Recruit", async () => {
    const game = await board().build();
    const fired = await retreatInResponse(game, "viktor");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("hand");
    expect(game.p1.hand()).toEqual(["viktor"]);
    expect(game.p1.runes()).toHaveLength(1);
    expect(fired).toBe(false);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units()).toEqual(["pawn"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
