/**
 * Ruling 15995356baf0a16d — Scuttle Crab (UNL-053 → unl-053-219) · 0 Might · "When you play me, draw 1.
 *   [Deathknell] Choose an opponent. They reveal their hand. You can look at their facedown cards this turn.
 *   Gain 1 XP."
 *   × Glorious Executioner (sfd-185-221, Draven legend) "When you win a combat, draw 1."
 *   × Kai'Sa, Survivor (ogn-039-298) · 4 Might · "When I conquer, draw 1."
 *
 * Q: I conquer with Kai'Sa (Draven legend) into the opponent's Scuttle Crab. Do I draw 2 first, or does the
 *    Deathknell go first?
 * A: Deathknell first. It fires in Combat Cleanup and resolves (hand revealed, opponent +1 XP); then Draven's
 *    "win a combat" trigger → draw 1; then the conquer happens and Kai'Sa's trigger → draw 1. Two draws total,
 *    both after the reveal, each in its own window — the reveal never sees either drawn card.
 * Rules: 461.1–461.3 / 466 (combat resolution order: cleanup kills → result → control/conquer), 808 (Deathknell),
 *        323.4 (death triggers noted at cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";
const GLORIOUS_EXECUTIONER = "sfd-185-221";
const KAISA_SURVIVOR = "ogn-039-298";

function board() {
  return scenario()
    .legend(P1, GLORIOUS_EXECUTIONER, "draven")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .unit(P2, "bf1", SCUTTLE_CRAB, "crab")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Secret Plan" }, "secret");
}

/** Resolve exactly the current top chain item (both players pass once). */
async function resolveTop(game: Game): Promise<void> {
  const top = game.chain().at(-1)?.id;
  for (let i = 0; i < 4 && top !== undefined && game.chain().some((c) => c.id === top); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

type Grants = readonly { owner: string; viewer: string; zones: readonly string[]; duration: string }[];
const grants = (game: Game): Grants => ((game.gameState as unknown as { visibilityGrants?: Grants }).visibilityGrants ?? []) as Grants;
type Reveals = readonly { playerId: string; cardIds: readonly string[] }[];
const publicReveals = (game: Game): Reveals =>
  ((game.gameState as unknown as { publicReveals?: Reveals }).publicReveals ?? []) as Reveals;

describe("Ruling 15995356baf0a16d — Scuttle Crab's Deathknell resolves before Draven's and Kai'Sa's draws", () => {
  test("ruling 15995356baf0a16d — step by step: combat kills the Crab → (1) Deathknell alone on the chain, resolves: P2 +1 XP, P1's hand revealed, no draws yet → (2) Draven's win trigger: draw 1 → (3) conquer, Kai'Sa's trigger: draw 1 — 2 draws total, all after the reveal", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    expect(game.state("kaisa").combatRole).toBe("attacker");
    // Nobody acts in the showdown → combat: 4 into a 0-Might Crab.
    await game.p1.passFocus();
    await game.p2.passFocus();

    // (1) Combat cleanup: the Crab is dead and its Deathknell is the ONLY item on the chain (P2's), before any draw.
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crab", controller: P2, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p2.xp()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // conquer has not happened yet
    await resolveTop(game);
    expect(game.p2.xp()).toBe(1);
    // rule 424.1.a.3 — the hand reveal is a MOMENT, not a lasting grant: it lands on the shared public-reveal record and
    // is redacted again afterwards. Only "look at their facedown cards this turn" is a turn-scoped visibility grant.
    expect(publicReveals(game).at(-1)).toMatchObject({ playerId: P1 });
    expect(grants(game)).toContainEqual(
      expect.objectContaining({ owner: P1, viewer: P2, zones: expect.arrayContaining(["facedown"]) }),
    );
    expect(game.p1.hand()).toHaveLength(hand0); // the reveal saw exactly the pre-combat hand

    // (2) Combat result determined → Draven's "when you win a combat" is next, on its own.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0);
    await resolveTop(game);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);

    // (3) Now the conquer: control flips, the point is scored, and Kai'Sa's "When I conquer" is the next window.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", controller: P1, triggered: true })]);
    await resolveTop(game);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("kaisa")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("end state via settle(): Crab in trash, P2 at 1 XP, P1 drew exactly 2 and conquered bf1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
