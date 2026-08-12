/**
 * Ruling 845874ec90e6da73 — Overzealous Fan (SFD-128 → sfd-128-221) "When I defend, you may kill me to move
 *   an attacking unit to its base."
 *   × Vex, Cheerless (sfd-146-221) 5 Might "While I'm in combat, friendly spells cost [1][rainbow] less to a
 *     minimum of [1], and enemy spells cost [1][rainbow] more."
 *   × Back to Back (ogn-206-298) · [Reaction] · [3] "Give two friendly units each +2 [Might] this turn."
 *   × Ride the Wind (ogn-173-298) · [Action] · [2][chaos].
 *
 * Q: I move Vex into a battlefield with an enemy Overzealous Fan; the Fan sends Vex back to base. Can I still
 *    play discounted spells before the chain ends?
 * A: Not usefully. While the Fan's trigger is on the chain the state is CLOSED — no [Action] spells at all —
 *    and you cannot interrupt a resolution. By the time the state is open again Vex is at base, out of
 *    combat, and her discount is gone. (A [Reaction] in RESPONSE is still legal, and is still discounted,
 *    because Vex is in combat at that moment.)
 * Rules: 154.3 / 336.1 (no play inside a resolution), 340 (closed state: reactions only), 347 (Action speed
 *        needs an open state), 365 (a static applies only while its condition holds).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const VEX_CHEERLESS = "sfd-146-221";
const BACK_TO_BACK = "ogn-206-298"; // [Reaction], printed [3]
const RIDE_THE_WIND = "ogn-173-298"; // [Action]

/** P1's turn with exactly [2] — one short of Back to Back's printed [3], so only the discount can pay for it. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, BACK_TO_BACK, "btb")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Vex attacks bf1; P2 opts into the Fan (killing it) and names Vex; stop with the trigger still on the chain. */
async function fanTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  await game.p2.yes(); // "kill me to…" — cost paid at finalization
  const d = game.decision();
  if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "vex")?.key ?? d.options[0]!.key);
  expect(game.zoneOf("fan")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
  return game;
}

describe("Ruling 845874ec90e6da73 — by the time the chain is empty Vex is home and her discount is gone", () => {
  test("baseline: while Vex is in combat her static really does pay for Back to Back out of just [2]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", VEX_CHEERLESS, "vex")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, BACK_TO_BACK, "btb")
      .build();
    await game.p1.move("vex", "bf1");
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.p1.can("cast", "btb")).toBe(true); // [3] − [1] = [2]
  });

  test("with the Fan's trigger on the chain the state is CLOSED: no [Action] spell, though a [Reaction] in response is still legal and still discounted", async () => {
    const game = await fanTriggerOnChain();
    await game.p2.passPriority(); // priority to P1, with the trigger still unresolved
    expect(game.actingSeat()).toBe(P1);
    expect(game.locationOf("vex")).toBe("bf1"); // Vex has not been moved yet

    expect(game.p1.can("cast", "rtw")).toBe(false); // Actions need an open state
    expect(game.p1.can("cast", "btb")).toBe(true); // Reactions may respond — and Vex is still in combat
  });

  test("once the trigger resolves Vex is at base, out of combat: Back to Back now costs its printed [3] and [2] no longer covers it", async () => {
    const game = await fanTriggerOnChain();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("vex")).toBe("base");
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "btb")).toBe(false); // no discount any more
    expect(game.violations()).toEqual([]);
  });
});
