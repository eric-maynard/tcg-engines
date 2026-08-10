/**
 * Ruling f0408d763d32d4e9 — Warwick, Hunter (OGN-159 → ogn-159-298) · [6]+[body] · 5 Might
 *     "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might "When I defend, you may kill me to move an attacking unit to its base."
 *   × Mountain Drake (OGN-142 → ogn-142-298) · 10 Might (vanilla)   × Bullet Time (OGN-268 → ogn-268-298) [1] [Action]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Warwick attacks into Fan + a damaged Mountain Drake; the Fan's trigger sends Warwick to base before Warwick's
 *    ability resolves. Does the damaged Drake die?
 * A: No. Attack trigger (Warwick) goes on the chain first, the defend trigger (Fan) on top; the Fan resolves first and
 *    returns Warwick to base; Warwick's ability then resolves but "here" is now where Warwick is — no enemy units there —
 *    so the Drake survives (and its damage is healed at the end of combat). Alternative: Bullet Time the Fan away first,
 *    THEN attack — Warwick's trigger kills the damaged Drake and conquers.
 * Rules: 383.4.e/f (attack then defend triggers), 340 (LIFO), 106.4 ("here" = the source's current location at
 *        resolution), 465/466 (combat ends, damage healed), 383.3.b (CR: the Fan's "kill me" cost is paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const OVERZEALOUS_FAN = "sfd-128-221";
const MOUNTAIN_DRAKE = "ogn-142-298";
const BULLET_TIME = "ogn-268-298";

/** P1's turn. P2 holds bf1 with Overzealous Fan (2) and a Mountain Drake (10) carrying 3 damage. P1: Warwick ready in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", MOUNTAIN_DRAKE, "drake", { damage: 3 })
    .unit(P1, "base", WARWICK, "ww")
    .hand(P1, BULLET_TIME, "bt");
}

/** Warwick attacks bf1; P2 accepts the Fan (killed as the cost) targeting Warwick. Returns with the initial chain built. */
async function warwickAttacksFanAccepts(): Promise<Game> {
  const game = await board().build();
  expect(game.state("drake")).toMatchObject({ damage: 3, might: 10 });
  await game.p1.move("ww", "bf1");
  expect(game.state("ww").combatRole).toBe("attacker");
  // Attacker's trigger is already on the chain (bottom); the defender's Fan asks its "you may kill me" at finalization.
  expect(game.chain()[0]).toMatchObject({ cardId: "ww", controller: P1, triggered: true });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" }, timing: "FIN" });
  await game.p2.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("ww"); // "an attacking unit" — Warwick is the only one (usually auto-bound)
  }
  expect(game.zoneOf("fan")).toBe("trash"); // CR 383.3.b: the kill-me cost is paid as the trigger is finalized
  expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
    ["ww", P1], // attack trigger first (bottom)
    ["fan", P2], // defend trigger on top → resolves first
  ]);
  expect(game.chain()[1]?.targets).toEqual(["ww"]);
  return game;
}

describe("Ruling f0408d763d32d4e9 — Overzealous Fan bounces Warwick before his attack trigger resolves: 'here' moves with him, the Drake lives", () => {
  test("sequence: Warwick's attack trigger (bottom) then the Fan's defend trigger (top); the Fan resolves first and Warwick is back in base while his trigger still waits", async () => {
    const game = await warwickAttacksFanAccepts();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fan's item resolves
    expect(game.locationOf("ww")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.state("drake").damage).toBe(3); // nothing has touched it yet
  });

  test("Warwick's trigger then resolves with 'here' = his current location (base): no damaged ENEMY unit there ⇒ nothing dies; the attacker-less combat ends, the Drake survives, its damage is healed, bf1 stays P2's", async () => {
    const game = await warwickAttacksFanAccepts();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("ww")).toBe("base");
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.state("drake").damage).toBe(0); // healed at end of combat
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("fan")).toBe("trash"); // the Fan paid with its life regardless
    expect(game.violations()).toEqual([]);
  });

  test("the alternative line: Bullet Time for 2 at bf1 FIRST (Fan dies, Drake now 5 damage), THEN Warwick attacks — no Fan to bounce him, his trigger kills the damaged Drake 'here' and P1 conquers bf1", async () => {
    const game = await board().build();
    const opt = game.p1.option("cast", "bt");
    expect(opt).toBeDefined();
    const targetField = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
    await game.p1.cast("bt", targetField ? { targets: "bf1", x: 2 } : { x: 2 });
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "integer" && d.seat === P1) {
        await game.p1.chooseX(2);
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => /bf1/.test(String(o.zone ?? o.key)))?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.state("drake").damage).toBe(5);
    await game.p1.move("ww", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("drake")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
