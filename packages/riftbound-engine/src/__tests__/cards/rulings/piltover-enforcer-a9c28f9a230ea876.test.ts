/**
 * Ruling a9c28f9a230ea876 — Piltover Enforcer (UNL-187 → unl-187-219) · Legend (Vi)
 *   "When you conquer, if you assigned 3 or more excess damage, you may exhaust me to ready a unit."
 *
 * Q: If a champion conquers a location with no enemy units, does that count as dealing excess damage for the Enforcer?
 * A: No. Excess damage only exists in the Combat Damage Step, which needs attackers AND defenders. Moving onto an empty
 *    battlefield is a Non-Combat Showdown: no combat, no assignment — the "3 or more excess" condition is simply not met,
 *    even though you do conquer.
 * Rules: 465.1 (damage step only with both sides present), 465.2.c.3–4 (excess = assigned beyond lethal), 460.2.c,
 *        348.2.a (non-combat showdown close → conquer), 383.2.a (intervening "if").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PILTOVER_ENFORCER = "unl-187-219";

/** P1 (Vi legend) with a huge 8-Might champion in base; bf1 EMPTY and uncontrolled; P2's lone 2-Might Sentry holds bf2. */
function board() {
  return scenario()
    .legend(P1, PILTOVER_ENFORCER, "vi")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { cardType: "unit", isChampion: true, might: 8, name: "Bruiser Champion", tags: ["Vi"] }, "champ")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling a9c28f9a230ea876 — conquering an EMPTY battlefield assigns no damage, so Piltover Enforcer's excess-damage condition fails", () => {
  test("the champion moves onto empty bf1: a NON-combat showdown (no defender, no combat roles' damage step); when both pass P1 conquers bf1 and scores…", async () => {
    const game = await board().build();
    await game.p1.move("champ", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.passFocus();
    // No distribute (damage assignment) prompt ever appears on the way.
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.conqueredThisTurn[P1] ?? []).toContain("bf1");
  });

  test("…but the Enforcer is NOT offered: no damage was assigned at all (let alone 3 excess) — no yes/no from the legend, no chain item, legend stays ready", async () => {
    const game = await board().build();
    await game.p1.move("champ", "bf1");
    let offered = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "vi") {
        offered = true;
        await game.p1.no();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(offered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("vi").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — the same 8-Might champion into P2's lone 2-Might Sentry at bf2 IS a combat: 8 assigned vs lethal 2 = 6 excess → on the conquer the Enforcer's 'exhaust me to ready a unit' is offered", async () => {
    const game = await board().build();
    await game.p1.move("champ", "bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2", isCombatShowdown: true });
    await game.p1.passFocus();
    await game.p2.passFocus();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "distribute") {
        await game.seat(d.seat).distribute(d.defaultAllocation ?? {});
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "vi" } });
    await game.p1.yes();
    const pick = game.decision();
    if (pick?.kind === "pick" && pick.seat === P1) {
      await game.p1.pick("champ");
    }
    await game.settle();
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("champ").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

