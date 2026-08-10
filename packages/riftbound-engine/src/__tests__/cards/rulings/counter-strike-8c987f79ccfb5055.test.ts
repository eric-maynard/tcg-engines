/**
 * Ruling 8c987f79ccfb5055 — Counter Strike (SFD-194 → sfd-194-221) × Elder Dragon (UNL-118 → unl-118-219)
 *
 *   Counter Strike — Spell · Calm/Body · 2 · Reaction
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   Elder Dragon — Unit · Body · 12 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at
 *      each location. Deal 1 to them."
 *
 * Q: If I Counter Strike in response to the opponent's Elder Dragon play effect, does the chosen unit still die?
 * A: No. Elder Dragon's passive only lowers what counts as lethal; it does not change the amount dealt. Counter
 *    Strike prevents all of the 1 damage, so 0 is dealt (437.2.a — same as no damage), and the passive never
 *    gets to apply. The protected unit lives; unprotected picks still die to 1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
const ELDER_DRAGON = "unl-118-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with exactly 12 + [body]×4. P2: Pawn (4) at bf1, Grunt (4) in base, Counter Strike in hand with 2 + power. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .resources(P2, { energy: 2, power: { calm: 1, body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, ELDER_DRAGON, "dragon")
    .hand(P2, COUNTER_STRIKE, "cs");
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Play the Dragon and answer its per-location picks with Pawn and Grunt; stop at the first chain priority window. */
async function dragonPicksBoth(game: Game): Promise<void> {
  await game.p1.play("dragon");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const hit = ["pawn", "grunt"].filter((k) => offered(d).includes(k));
      if (hit.length > 0) {
        await game.p1.pick(...hit.slice(0, Math.max(1, Math.min(hit.length, d.max))));
      } else {
        await game.p1.decline();
      }
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
}

describe("Ruling 8c987f79ccfb5055 — Counter Strike saves a unit from Elder Dragon's 1-damage ping despite 'any amount is lethal'", () => {
  test("control: unanswered, the Dragon's trigger deals 1 to Pawn and Grunt and both 4-Might units die (any amount of P1's damage is lethal)", async () => {
    const game = await board().build();
    await dragonPicksBoth(game);
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
  });

  test("with the trigger on the chain (targets locked), P2 gets priority and Counter Strike — a Reaction — is legal on Pawn", async () => {
    const game = await board().build();
    await dragonPicksBoth(game);
    const trig = game.chain().find((c) => c.cardId === "dragon" && c.triggered);
    expect(trig).toBeDefined();
    expect([...(trig?.targets ?? [])].sort()).toEqual(["grunt", "pawn"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "cs")).toBe(true);
    await game.p2.cast("cs", { targets: "pawn" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "cs", controller: P2 });
    expect(game.p2.energy()).toBe(0);
  });

  test("LIFO: Counter Strike resolves first (shield set, P2 draws 1); the ping then deals 0 to Pawn — it survives undamaged — while unprotected Grunt still dies to 1", async () => {
    const game = await board().build();
    await dragonPicksBoth(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    const handBefore = game.p2.hand().length; // includes cs
    await game.p2.cast("cs", { targets: "pawn" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore - 1 + 1); // cast cs, drew 1
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    expect(game.state("pawn").damage).toBe(0); // fully prevented = not dealt (437.2.a)
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
