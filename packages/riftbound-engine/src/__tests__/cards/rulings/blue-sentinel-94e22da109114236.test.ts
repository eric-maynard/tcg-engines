/**
 * Ruling 94e22da109114236 — Blue Sentinel (UNL-087 → unl-087-219) · Unit · Mind · 4 · 4 Might
 *     "[Shield 2] Your hold effects for holding here trigger an additional time. When I hold, [Add] [rainbow] at the start
 *     of your next Main Phase."
 *   × Power Nexus (SFD-214 → sfd-214-221) · Battlefield · "When you hold here, you may pay [rainbow]×4 to score 1 point."
 *
 * Q: Blue Sentinel holds at Power Nexus — can the Nexus trigger twice and score 2 points?
 * A: Yes. The Nexus's "When you hold here" triggers an additional time → two chain items; you may pay [rainbow]×4 for
 *    each and score 1 point per resolution. These points come from a triggered ability, not from the Hold itself, so the
 *    once-per-battlefield scoring limit does not apply.
 * Rules: 383.4.d (hold effects), 465 (once-per-battlefield applies to Conquer/Hold scoring only), 383.3.b (pay on the trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";
const POWER_NEXUS = "sfd-214-221";

/** End of P2's turn 2. P1 controls the (live) Power Nexus with `holder` on it and has 8 ready runes to recycle for power. */
function aboutToHold(holder: string | { might: number; name: string }) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .unit(P1, "nexus", holder, "holder")
    .runes(P1, "mind", 8);
}

const nexusItems = (game: Game) => game.chain().filter((c) => c.cardId === "nexus" && c.triggered && c.controller === P1);

/**
 * Answer every Power Nexus pay prompt with YES, recycling runes (Reaction/[Add], legal mid-prompt) until the four power
 * are in the pool; then pass priority until the main phase. Returns how many Nexus prompts were accepted.
 */
async function payEveryNexusPrompt(game: Game): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "nexus") {
      expect(d.seat).toBe(P1);
      if (d.canAccept) {
        accepted += 1;
        await game.p1.yes();
      } else {
        expect((d.actions ?? []).some((a) => a.key.startsWith("recycleRune"))).toBe(true);
        await game.p1.recycleRune();
      }
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      await game.acting().pass();
    }
  }
  return accepted;
}

describe("Ruling 94e22da109114236 — Blue Sentinel makes Power Nexus trigger twice: pay twice, score twice", () => {
  test("control — a vanilla holder at Power Nexus: the hold scores 1, ONE Nexus trigger, pay [rainbow]×4 once → 2 points total", async () => {
    const game = await aboutToHold({ might: 4, name: "Plain Holder" }).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(nexusItems(game)).toHaveLength(1);
    expect(await payEveryNexusPrompt(game)).toBe(1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.runes()).toHaveLength(8 - 4 + 2); // 4 recycled, 2 channeled this turn
  });

  test("Blue Sentinel holding the Nexus: the hold itself still scores exactly 1, but the Nexus's 'When you hold here' is on the chain TWICE", async () => {
    const game = await aboutToHold(BLUE_SENTINEL).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(nexusItems(game)).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "nexus" } });
  });

  test("P1 pays [rainbow]×4 for EACH instance (8 runes recycled) and each resolution scores 1: 1 (hold) + 1 + 1 = 3 points — no once-per-battlefield cap on these", async () => {
    const game = await aboutToHold(BLUE_SENTINEL).build();
    await game.p2.endTurn();
    expect(await payEveryNexusPrompt(game)).toBe(2);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(3);
    expect(game.p1.runes()).toHaveLength(8 - 8 + 2);
    expect(game.gameState.battlefields.nexus?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("paying is optional per instance: accept the first, decline the second → 2 points", async () => {
    const game = await aboutToHold(BLUE_SENTINEL).build();
    await game.p2.endTurn();
    let accepted = 0;
    for (let i = 0; i < 40; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.source?.cardId === "nexus") {
        if (accepted === 1) {
          await game.p1.no();
          accepted += 1;
        } else if (d.canAccept) {
          await game.p1.yes();
          accepted += 1;
        } else {
          await game.p1.recycleRune();
        }
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        await game.acting().pass();
      }
    }
    expect(game.p1.points()).toBe(2);
    expect(game.p1.runes()).toHaveLength(8 - 4 + 2);
  });
});
