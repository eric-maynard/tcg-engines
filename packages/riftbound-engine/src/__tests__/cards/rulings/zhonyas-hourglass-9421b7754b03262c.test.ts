/**
 * Ruling 9421b7754b03262c — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Watchful Sentry (ogn-096-298, 2 Might, "[Deathknell] — Draw 1") as "a unit with Deathknell".
 *
 * Q: My hidden card at a battlefield is Zhonya's; my only unit there has Deathknell. It dies and I don't react with the
 *    Zhonya's. Do I take the Zhonya's back to base, or is it gone?
 * A: Gone. When your only unit there dies you lose control of that battlefield, and a facedown card at a battlefield you
 *    no longer control is removed (trashed) in the next cleanup. Having passed the reaction window (the Deathknell
 *    trigger), the opportunity is over — the hidden card is discarded, not returned.
 * Rules: 181.4.c / 323.7 (facedown card removed when control is lost), 190.4 / 323.6 (control lapses with no units),
 *        466.5.c (loser's facedown card trashed at combat resolution), 808 (Deathknell), 811 (hidden ⇒ Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const WATCHFUL_SENTRY = "ogn-096-298";
/** Inline "[Action] Deal 3 to a unit." — a non-combat kill for the second case. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline)",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a lone Watchful Sentry and Zhonya's face down there; P2 has a Raider (5) and a Bolt with [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .facedown(P1, "bf1", ZHONYAS, "zhonyas")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, BOLT, "bolt")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

describe("Ruling 9421b7754b03262c — an un-flipped hidden Zhonya's is trashed, not returned, once its battlefield is lost", () => {
  test("combat: the Sentry dies to the Raider, its Deathknell goes on the chain and P1 gets priority (revealing Zhonya's WOULD be legal) — P1 passes; the Deathknell draws, the Raider conquers bf1 and the still-hidden Zhonya's goes to P1's TRASH (not base, not hand)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus(); // combat damage → Sentry dies
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true); // the reaction window …
    expect(game.zoneOf("zhonyas")).toBe("facedown-bf1");
    await game.p1.passPriority(); // … deliberately not used
    await game.settle();
    expect(game.p1.hand()).toContain("d1"); // Deathknell paid out
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("zhonyas").isHidden).toBe(false);
    expect(game.p1.base()).not.toContain("zhonyas");
    expect(game.p1.hand()).not.toContain("zhonyas");
    expect(game.p1.can("reveal", "zhonyas")).toBe(false); // the opportunity is gone
    expect(game.violations()).toEqual([]);
  });

  test("outside combat (Bolt kills the lone Sentry): P1 again has priority on the Deathknell with the reveal available, passes — once the chain empties control of the empty bf1 lapses and the facedown Zhonya's is trashed in that cleanup", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "sentry" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves, Sentry dies
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.passPriority();
    await game.settle();
    expect(game.p1.hand()).toContain("d1");
    expect(bf1(game)?.controller).not.toBe(P1); // no units left → control lost
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p1.base()).not.toContain("zhonyas");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
