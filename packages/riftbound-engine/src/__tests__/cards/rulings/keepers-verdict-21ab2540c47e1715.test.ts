/**
 * Ruling 21ab2540c47e1715 — Keeper's Verdict (UNL-204 → unl-204-219, Action, 2 + [rainbow][rainbow])
 *   "Choose an enemy unit at a battlefield. Its owner places it on the top or bottom of their Main Deck."
 *   × Rengar, Pouncing (sfd-025-221, 3, [Reaction] [Assault 2]) "I can be played to a battlefield you're attacking."
 *
 * Q: My opponent is attacking and pounces Rengar in — can Keeper's Verdict stop him from conquering?
 * A: Yes. Rengar at the battlefield is a legal "enemy unit at a battlefield"; on resolution his OWNER puts him on the
 *    top or bottom of their deck. Conquering needs units there when the showdown ends, so with Rengar gone (and no
 *    other attacker surviving) there is no conquer. (It does not "counter" the play — Rengar did enter.)
 * Rules: 355 (target locked at play), 465/445 (conquer requires attackers remaining after combat), 340 (Action on Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KEEPERS_VERDICT = "unl-204-219";
const RENGAR = "sfd-025-221";

/**
 * P2's turn. P1 holds bf1 with a 3-Might Defender. P2 attacks with a 2-Might Scout from base and holds Rengar with
 * exactly 3 + [fury]. P1 holds Keeper's Verdict with exactly 2 + two rainbow.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .resources(P1, { energy: 2, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P2, RENGAR, "rengar")
    .hand(P1, KEEPERS_VERDICT, "verdict");
}

/** Scout attacks bf1; P2 (Focus) pounces Rengar into the attacked battlefield. Returns with P1 holding Focus. */
async function rengarPounces(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  const to = game.p2.option("play", "rengar")?.fields.find((f) => f.arg === "to")?.options ?? [];
  expect(to).toContain("battlefield-bf1"); // "I can be played to a battlefield you're attacking"
  await game.p2.play("rengar", { to: "bf1" });
  for (let i = 0; i < 6 && game.actingSeat() !== P1; i++) {
    await game.p2.pass();
  }
  expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
  expect(game.state("rengar")).toMatchObject({ combatRole: "attacker", might: 5 }); // 3 + Assault 2
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 21ab2540c47e1715 — Keeper's Verdict removes a pouncing Rengar mid-combat and denies the conquer", () => {
  test("control: left alone, Rengar (5) + Scout (2) overwhelm the 3-Might Defender and P2 conquers bf1", async () => {
    const game = await rengarPounces();
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("Rengar at the battlefield is a legal target: P1 (with Focus) casts Keeper's Verdict on him; it goes on the chain with the target locked", async () => {
    const game = await rengarPounces();
    const offered = (
      game.p1.option("cast", "verdict")?.fields.find((f) => f.name === "targets")?.options ?? []
    ).flat();
    expect(offered.sort()).toEqual(["rengar", "scout"]); // enemy units at a battlefield — never P1's Defender
    await game.p1.cast("verdict", { targets: "rengar" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "verdict", controller: P1, targets: ["rengar"] }),
    ]);
  });

  test("on resolution Rengar's OWNER (P2) is the one asked top-or-bottom; Rengar leaves the board for P2's Main Deck", async () => {
    const game = await rengarPounces();
    await game.p1.cast("verdict", { targets: "rengar" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["mainDeck-bottom", "mainDeck-top"]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.answer("mainDeck-bottom");
    expect(game.zoneOf("rengar")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("rengar");
    expect(game.p2.trash()).not.toContain("rengar"); // not killed, not countered — placed in the deck
    expect(game.zoneOf("verdict")).toBe("trash");
  });

  test("with Rengar gone the lone 2-Might Scout dies to the Defender: no attacker remains when the showdown ends → no conquer, P1 keeps bf1, P2 scores nothing", async () => {
    const game = await rengarPounces();
    await game.p1.cast("verdict", { targets: "rengar" });
    game.script(P2, ["mainDeck-top"]);
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("mainDeck");
    expect(game.p2.deck()[0]).toBe("rengar");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
