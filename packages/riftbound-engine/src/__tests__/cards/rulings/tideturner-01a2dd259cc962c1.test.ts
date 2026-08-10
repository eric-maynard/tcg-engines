/**
 * Ruling 01a2dd259cc962c1 — Tideturner (OGN-199 → ogn-199-298) · Chaos · [2] · 2 Might · "[Hidden] When you play me, you may choose a
 *     unit you control at another location. Move me to its location and it to my original location."
 *   × Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · "[Deflect 2] When I attack, deal 5 damage split among any number of
 *     enemy units here."
 *
 * Q: Volibear attacks; before the showdown proceeds the defender flips a hidden Tideturner and swaps a unit in. Can Volibear's
 *    split damage hit the unit Tideturner brings to the battlefield?
 * A: No. The recipients of the split are chosen when the trigger is finalized and can't be changed. After the swap the original
 *    recipient is no longer "here", so the ability resolves doing nothing; the newcomer was never a recipient. (Amounts are only
 *    assigned on resolution, but the SET of targets is fixed at finalization.)
 * Rules: 355.14 (split: targets at finalization, amounts at resolution), 402 (finalized targets are locked), 359.3.e.5/7 (illegal
 *        target on resolution → nothing), 811 (hidden play with priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const VOLIBEAR = "ogn-041-298";

/**
 * Turn 3, P1's turn. P2 holds bf1 with a lone Sentry (3) and bf2 with a Watch (2), and hid Tideturner at bf2 on an earlier turn.
 * Volibear ready in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .facedown(P2, "bf2", TIDETURNER, "tide")
    .unit(P1, "base", VOLIBEAR, "voli");
}

/** Volibear attacks bf1; P1 locks the split's recipient set (only the Sentry is here) and passes priority to P2. */
async function voliAttacksAndLocks(game: Game): Promise<void> {
  await game.p1.move("voli", "bf1");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, targeting: "split-targets" });
  expect(d.options.map((o) => o.card ?? o.key)).toEqual(["sentry"]);
  await game.p1.pick("sentry");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: ["sentry"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** P2 flips Tideturner at bf2, accepts its swap and names the Sentry (at bf1); the swap resolves first (LIFO). */
async function tideSwapsSentryOut(game: Game): Promise<void> {
  expect(game.p2.can("reveal", "tide")).toBe(true);
  await game.p2.reveal("tide");
  expect(game.zoneOf("tide")).toBe("battlefield-bf2");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("sentry");
      await game.p2.pick("sentry");
    } else {
      break;
    }
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "tide"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Tideturner's swap resolves
  expect(game.locationOf("tide")).toBe("bf1");
  expect(game.locationOf("sentry")).toBe("bf2");
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
  expect(game.chain()[0]?.targets).toEqual(["sentry"]); // unchanged — no re-targeting
}

describe("Ruling 01a2dd259cc962c1 — Volibear's split recipients are locked at finalization; a Tideturner swap makes it whiff", () => {
  test("recipients are chosen as the trigger is finalized (before P2 can do anything): only the Sentry, the unit here NOW", async () => {
    const game = await board().build();
    await voliAttacksAndLocks(game);
  });

  test("P2 flips the hidden Tideturner (at bf2) and swaps: Tideturner → bf1, Sentry → bf2; Volibear's item still names the Sentry", async () => {
    const game = await board().build();
    await voliAttacksAndLocks(game);
    await tideSwapsSentryOut(game);
    expect(game.state("tide").combatRole).toBe("defender"); // it joined the combat at bf1
  });

  test("Volibear's ability then resolves to NOTHING: the Sentry is no longer here (illegal), Tideturner was never a recipient — nobody takes any of the 5", async () => {
    const game = await board().build();
    await voliAttacksAndLocks(game);
    await tideSwapsSentryOut(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // No amount prompt for P1 either — there is no legal recipient to distribute among.
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.chain()).toEqual([]);
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("tide")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("watch").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: without the flip, the locked Sentry takes all 5 on resolution and dies", async () => {
    const game = await board().build();
    await voliAttacksAndLocks(game);
    await game.p2.passPriority();
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ sentry: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("trash");
  });
});
