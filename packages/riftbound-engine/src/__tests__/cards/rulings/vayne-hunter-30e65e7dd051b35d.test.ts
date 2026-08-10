/**
 * Ruling 30e65e7dd051b35d — Vayne, Hunter (OGN-035 → ogn-035-298) · Champion Unit · Fury · [4][fury] · 2 Might
 *     "[Assault 3] … If an opponent controls a battlefield, I enter ready. When I conquer, you may pay [1] to return me
 *      to my owner's hand."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: The opponent controls exactly one battlefield, held by a single token, and has Hidden Blade ready to react. Can
 *    they kill their own token "in response" so that Vayne does not enter ready?
 * A: No — Vayne always enters ready here. "I enter ready" is a passive ability (no "when"/"at"), applied as she
 *    enters; it never goes on the chain, so there is nothing to react to before it takes effect.
 * Rules: 359.2 / 367 (passive abilities don't use the chain), 383.1 (triggered abilities are worded "when"/"at"),
 *        346 (what can be reacted to).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VAYNE = "ogn-035-298";
const HIDDEN_BLADE = "ogn-213-298";
const RECRUIT_TOKEN = { cardType: "unit", isToken: true, might: 1, name: "Recruit Token" } as const;

/**
 * P1's turn (turn 3). P2 controls only bf1, held by a lone Recruit token, and has a Hidden Blade facedown there
 * (hidden on an earlier turn, so it is live) plus spare resources. P1 holds Vayne with exactly [4][fury].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", RECRUIT_TOKEN, "token")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade");
}

describe("Ruling 30e65e7dd051b35d — Vayne's 'I enter ready' is passive: no chain, no reaction window, she is ready on arrival", () => {
  test("P1 plays Vayne while P2 controls bf1: she is on the board READY, and nothing of hers was ever put on the chain", async () => {
    const game = await board().hand(P1, VAYNE, "vayne").build();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.p1.play("vayne");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // Drive until she is on the board, recording every chain item seen on the way.
    const chainSeen: string[] = [];
    for (let i = 0; i < 8 && game.zoneOf("vayne") !== "base"; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      chainSeen.push(...game.chain().map((c) => `${c.cardId}:${c.triggered ? "trigger" : c.type}`));
      if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("vayne")).toBe("base");
    expect(game.state("vayne")).toMatchObject({ isExhausted: false, isReady: true });
    // No triggered "enter ready" item ever existed — the readiness was applied as she entered.
    expect(chainSeen.filter((c) => c === "vayne:trigger")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("P2 never gets to act between the play and Vayne being on the board ready: the token is untouched, Hidden Blade still facedown, and it is P1's open main phase", async () => {
    const game = await board().hand(P1, VAYNE, "vayne").build();
    await game.p1.play("vayne");
    let p2CouldReveal = false;
    for (let i = 0; i < 8 && game.zoneOf("vayne") !== "base"; i++) {
      const d = game.decision();
      if (d?.seat === P2 && game.p2.can("reveal", "blade")) {
        p2CouldReveal = true;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(p2CouldReveal).toBe(false);
    expect(game.state("vayne").isReady).toBe(true);
    expect(game.zoneOf("token")).toBe("battlefield-bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("reveal", "blade")).toBe(false); // Neutral Open on P1's turn: still no window
    expect(game.state("vayne").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the condition is simply read on entry: if NO opponent controls a battlefield, Vayne enters exhausted like any unit", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .hand(P1, VAYNE, "vayne")
      .build();
    await game.p1.play("vayne", { to: "base" });
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("base");
    expect(game.state("vayne")).toMatchObject({ isExhausted: true, isReady: false });
  });
});
