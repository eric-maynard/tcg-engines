/**
 * Ruling da5cea1aa541cd18 — Retreat (OGN-104 → ogn-104-298) · Reaction · Mind · 1
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Hostile Takeover (SFD-202 → sfd-202-221) · Spell · 5+[rainbow][rainbow]
 *     "Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *
 * Q: I Retreat an enemy unit I currently control through Hostile Takeover. Is it still recalled to their base at end of turn?
 * A: No. Retreat sends it to its OWNER's hand (not yours); the owner gets the rune. Having left the board it is no longer there for
 *    Hostile Takeover's end-of-turn "recall" to act on — it just stays in the owner's hand.
 * Rules: 127.1 / 108 (owner vs controller; cards go to their owner's hand), 450 (recall acts on a permanent on the board), FAQ #7666/#3919.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const HOSTILE_TAKEOVER = "sfd-202-221";

/** P1's turn 3 with exactly [6] + 2 rainbow (Takeover 5+2, Retreat 1). P2's Guard (3) alone at P2's bf1; P1's Anchor holds bf2. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, RETREAT, "retreat");
}

/** P1 takes the Guard over (it conquers bf1 for P1) and play returns to P1's open main phase. */
async function takenOver(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "guard" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
  for (let i = 0; i < 5; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "action" && d.context === "main") {
      break;
    }
  }
  expect(game.state("guard")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bf1" });
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling da5cea1aa541cd18 — Retreating a unit you stole with Hostile Takeover", () => {
  test("the possessed Guard counts as 'friendly' for P1's Retreat (P1 controls it) and is a legal target alongside P1's own Anchor", async () => {
    const game = await takenOver();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const offered = (game.p1.option("cast", "retreat")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(new Set(offered as string[])).toEqual(new Set(["guard", "anchor"]));
  });

  test("Retreat resolves: the Guard goes to its OWNER's (P2's) hand — not P1's — and P2, the owner, channels 1 rune exhausted (P1 channels nothing)", async () => {
    const game = await takenOver();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    await game.p1.cast("retreat", { targets: "guard" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.p2.hand()).toContain("guard");
    expect(game.p1.hand()).not.toContain("guard");
    expect(game.state("guard")).toMatchObject({ controller: P2, owner: P2 }); // control reverts off the board
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(p1Runes);
    expect(game.violations()).toEqual([]);
  });

  test("end of turn: Hostile Takeover's 'lose control and recall it' finds nothing on the board — the Guard is NOT put into P2's base; it is still in P2's hand on P2's turn", async () => {
    const game = await takenOver();
    await game.p1.cast("retreat", { targets: "guard" });
    await game.settle();
    await game.advanceTurn(); // P1's turn ends (the delayed recall would happen here) → P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.p2.hand()).toContain("guard");
    expect(game.p2.base()).not.toContain("guard");
    expect(game.p2.units()).not.toContain("guard");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Retreat: at end of turn the stolen Guard IS recalled to P2's base under P2's control", async () => {
    const game = await takenOver();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("guard")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("guard");
  });
});
