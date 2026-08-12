/**
 * Ruling 2187f4898f498707 — Fortified Position (OGN-279 → ogn-279-298, Battlefield)
 *     "When you defend here, choose a unit. It gains [Shield 2] this combat."
 *   × Crackshot Corsair (OGN-130 → ogn-130-298) · "When I attack, deal 1 to an enemy unit here."
 *
 * Q: When is Fortified Position used during a showdown?
 * A: It is not "used" at all — "When you defend" is an INITIAL-CHAIN trigger. Both sides' initial triggers
 *    are put on the chain as combat begins ("when I attack" first, then "when I defend"), the chain resolves
 *    LIFO so Fortified Position's Shield lands first, and only once that chain is empty does anyone get
 *    Focus to play Actions — the ATTACKER first.
 * Rules: 464.2 (designations + initial combat chain), 383.3.d (simultaneous triggers, turn player first),
 *        340.1 (LIFO), 344/347 (Focus in a showdown starts with the attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORTIFIED_POSITION = "ogn-279-298";
const CORSAIR = "ogn-130-298";

/** P2's turn. P1 defends its live Fortified Position with a 4-Might Sentinel; P2 attacks with Crackshot Corsair (2). */
function board() {
  return scenario()
    .active(P2)
    .battlefield("fort", { controller: P1, def: FORTIFIED_POSITION, inert: false })
    .unit(P1, "fort", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", CORSAIR, "corsair");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 2187f4898f498707 — Fortified Position is an initial-chain trigger, resolved before anyone may play Actions", () => {
  test("as combat begins both initial triggers are on the chain — the attacker's 'when I attack' at the bottom, the defender's Fortified Position on top", async () => {
    const game = await board().build();
    await game.p2.move("corsair", "fort");
    // Designations exist already; the defend trigger asks P1 for its unit as it is finalized.
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("sentinel").combatRole).toBe("defender");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fort" } });
    await game.p1.pick("sentinel");
    expect(game.chain().map((c) => c.cardId)).toEqual(["corsair", "fort"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    // Nobody has been offered Focus yet: this is a chain, not the showdown's action window.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("LIFO: Fortified Position resolves first (Sentinel gains Shield 2 → 6 while defending), then the attack trigger deals its 1", async () => {
    const game = await board().build();
    await game.p2.move("corsair", "fort");
    await game.p1.pick("sentinel");
    await game.acting().passPriority();
    await game.acting().passPriority(); // Fortified Position resolves
    expect(game.state("sentinel").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.state("sentinel").might).toBe(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["corsair"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Corsair's attack trigger resolves
    expect(game.state("sentinel").damage).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("only then does the showdown's action window open — and the ATTACKER holds Focus first, not the defender", async () => {
    const game = await board().build();
    await game.p2.move("corsair", "fort");
    await game.p1.pick("sentinel");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fort", focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle(); // combat: Sentinel 6 vs Corsair 2
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("battlefield-fort");
    expect(game.state("sentinel")).toMatchObject({ damage: 0, grantedKeywords: [], might: 4 });
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
