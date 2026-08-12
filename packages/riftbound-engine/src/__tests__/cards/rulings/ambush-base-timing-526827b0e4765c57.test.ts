/**
 * Ruling 526827b0e4765c57 — (no specific card) does [Ambush] give Reaction timing for a play into your BASE?
 *   Exercised with Inferna (UNL-002 → unl-002-219) · [2] · 1 Might · "[Ambush] [Assault 2]".
 *
 * Q: Can you use Ambush to play a unit into your base at Reaction timing?
 * A: No. Ambush's [Reaction] timing applies only to the extra location it opens — a battlefield where you
 *    have units. A play to your base is a normal unit play and needs [Action] timing in an Open State on
 *    your turn. (You may always play the unit to your base — just not at Reaction speed.)
 * Rules: 822.1 [Ambush] (an extra play location + Reaction timing for plays to that location),
 *        813.1.c.1 / 813.3.a (Reaction is permission only; unit plays keep their own restrictions),
 *        310.1.a (default: your turn, Neutral Open).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const INFERNA = "unl-002-219";

/** [Action] spell P2 uses on its own turn to open a chain (a Closed State on the opponent's turn). */
const OPENER = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Opener",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** Legal `to` destinations offered to P1 for playing Inferna right now. */
function destinations(game: Game): string[] {
  const field = game.p1.option("play", "inferna")?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

/** P2's turn. P1 holds Inferna and has a Scout at bf1 (a battlefield where P1 has units). */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .hand(P1, INFERNA, "inferna")
    .hand(P2, OPENER, "opener");
}

describe("Ruling 526827b0e4765c57 — Ambush's Reaction timing covers the battlefield play only, never the base", () => {
  test("on the opponent's turn, in a Closed State, the ONLY destination offered is the battlefield — not the base", async () => {
    const game = await board().build();
    await game.p2.cast("opener", { targets: "theirs" }); // Closed State on P2's turn
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1"]);
    expect((await game.p1.try((p) => p.play("inferna", { to: "base" }))).ok).toBe(false);
    await game.p1.play("inferna", { to: "bf1" });
    expect(game.locationOf("inferna")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("on MY own turn in an Open State the base is available again — the base play is legal, just not at Reaction speed", async () => {
    const game = await board().runes(P1, "fury", 2).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    await game.p1.tapRunes(2); // the pools emptied at the turn change — pay [2] again
    expect(destinations(game)).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("inferna"); // defaults to the base
    expect(game.locationOf("inferna")).toBe("base");
  });

  test("with no units at any battlefield, Ambush opens nothing on the opponent's turn: Inferna is not playable at all", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
      .hand(P1, INFERNA, "inferna")
      .hand(P2, OPENER, "opener")
      .build();
    await game.p2.cast("opener", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p1.can("play", "inferna")).toBe(false); // no battlefield play ⇒ no Reaction timing ⇒ nothing
  });
});
