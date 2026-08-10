/**
 * Ruling 2bff9e2ae8637259 — Singularity (OGN-105 → ogn-105-298) · Spell · Mind · 6 + [mind][mind] "Deal 6 to each of up to
 *   two units."
 *   × Retreat (OGN-104 → ogn-104-298) [Reaction] · 1 "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: One of Singularity's two chosen targets is Retreated in response — may I pick another unit instead?
 * A: No. Targets are locked when the spell is put on the chain; a response removing one of them does not let you retarget.
 *    The remaining legal target still takes its 6.
 * Rules: 355.5 (targets chosen as the spell is played), 359.3.f.2 (illegal target at resolution → that part does nothing;
 *        no new choices are made).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const RETREAT = "ogn-104-298";

/** P1's turn with 6 + [mind][mind]. P2: A, B, C (7 Might each — survive a 6) in base, Retreat in hand (1). */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 1 })
    .unit(P2, "base", { might: 7, name: "Alpha" }, "a")
    .unit(P2, "base", { might: 7, name: "Bravo" }, "b")
    .unit(P2, "base", { might: 7, name: "Charlie" }, "c")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, RETREAT, "retreat");
}

/** Singularity at A + B; P2 Retreats A in response; Retreat resolves (A → hand). Leaves Singularity on the chain. */
async function singularityThenRetreatA(game: Game): Promise<void> {
  await game.p1.cast("sing", { targets: ["a", "b"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["a", "b"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.p1.passPriority();
  await game.p2.cast("retreat", { targets: "a" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Retreat resolves
  expect(game.zoneOf("a")).toBe("hand");
}

describe("Ruling 2bff9e2ae8637259 — Singularity's targets are locked; a Retreated target can't be swapped for another", () => {
  test("after Retreat pulls Alpha, Singularity still lists its ORIGINAL targets [a, b] — no re-targeting prompt is offered to P1", async () => {
    const game = await board().build();
    await singularityThenRetreatA(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["a", "b"] })]);
    // The window that follows is an ordinary priority window, not a target choice.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.context : undefined).toBe("chain");
  });

  test("Singularity resolves: Bravo takes 6, Alpha (in hand) and Charlie (never chosen) take nothing; P1 was never asked to pick a replacement", async () => {
    const game = await board().build();
    await singularityThenRetreatA(game);
    let retargetPrompt = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        retargetPrompt = true;
        break;
      }
      if (d.kind === "action") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(retargetPrompt).toBe(false);
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("b").damage).toBe(6);
    expect(game.state("c").damage).toBe(0);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: both original targets take 6", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["a", "b"] });
    await game.settle();
    expect(game.state("a").damage).toBe(6);
    expect(game.state("b").damage).toBe(6);
    expect(game.state("c").damage).toBe(0);
  });
});
