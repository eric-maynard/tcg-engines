/**
 * Ruling b51c05d45214ff8e — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Ezreal, Dashing (sfd-082-221) · "When I attack or defend, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Yasuo moves into a battlefield held by an equal-Might Ezreal; Ezreal's trigger kills Yasuo first. Does Yasuo's
 *    trigger still deal damage?
 * A: No. Ezreal's (defender's, later-added) trigger resolves first and kills Yasuo; when Yasuo's trigger then resolves he
 *    is in the trash, "here" is nowhere, and the instruction misses its target — no damage. The same happens with any
 *    effect that takes Yasuo away from that battlefield first (e.g. Zhonya's recalling him to base).
 * Rules: 340 (LIFO), 383.3 (simultaneous triggers: turn player's first onto the chain), 359.3.e.5 (target/"here" no
 *        longer valid → instruction not performed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const EZREAL_DASHING = "sfd-082-221"; // 3 Might printed; +3 below to match Yasuo's 6

/** P1's turn. P2 holds bf1 with Ezreal at 6 Might; P1's Yasuo (6) in base; optionally Zhonya's face up in P1's base. */
function board(opts: { zhonyas?: boolean } = {}) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P2, "bf1", EZREAL_DASHING, "ezreal", { mightModifier: 3 });
  return opts.zhonyas ? s.gear(P1, ZHONYAS, "zhonya") : s;
}

/** Yasuo attacks bf1; accept any soft trigger-order offer. */
async function yasuoAttacks(game: Game): Promise<void> {
  expect(game.state("ezreal").might).toBe(6);
  expect(game.state("yasuo").might).toBe(6);
  await game.p1.move("yasuo", "bf1");
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
}

describe("Ruling b51c05d45214ff8e — Yasuo killed (or whisked away) before his attack trigger resolves deals no damage: he is no longer 'here'", () => {
  test("the showdown's initial chain: Yasuo's attack trigger (turn player, bottom) then Ezreal's defend trigger on top — each aimed at the other", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["ezreal"], triggered: true }),
      expect.objectContaining({ cardId: "ezreal", controller: P2, targets: ["yasuo"], triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("Ezreal's trigger resolves first: 6 damage kills Yasuo (to the trash) while Yasuo's trigger is still waiting on the chain", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("ezreal").damage).toBe(0);
  });

  test("Yasuo's trigger then resolves from the trash and misses: Ezreal takes NO damage and keeps bf1; nobody scores", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("ezreal")).toBe("battlefield-bf1");
    expect(game.state("ezreal").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("same principle with Zhonya's: Ezreal's damage would kill Yasuo → Zhonya's dies instead and recalls him to base; his trigger then resolves with him no longer 'here' → Ezreal unhurt", async () => {
    const game = await board({ zhonyas: true }).build();
    await yasuoAttacks(game);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    await game.settle();
    expect(game.state("ezreal").damage).toBe(0);
    expect(game.zoneOf("ezreal")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("yasuo")).toBe("base");
  });
});
