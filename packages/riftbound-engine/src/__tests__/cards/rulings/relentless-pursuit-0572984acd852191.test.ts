/**
 * Ruling 0572984acd852191 — Relentless Pursuit (SFD-184 → sfd-184-221) · Action · [2][rainbow]
 *     "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has 'When I
 *      conquer, you may move me to my base.'"
 *
 * Q: Does the granted "When I conquer, you may move me to base" remain for the rest of the turn?
 * A: Yes — it is a continuous grant with duration "this turn", so it applies EVERY time that unit conquers a battlefield for the
 *    remainder of the turn (each battlefield can still only be scored once per turn). It is gone next turn.
 * Rules: 364.3 (granting an ability for a duration), 469.1 (conquer), 441.3 (score each battlefield once per turn), 317.2 (this-turn expiry).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
// rule 355.7 / 355.9 (riftjudge 4283ca02526c0650) — the Equipment is named as the
// spell is played, so Relentless Pursuit needs one in play to be castable at all.
const RP_EQUIPMENT = "sfd-042-221";

/** P1's turn. Two EMPTY uncontrolled battlefields; P1's ready Runner (4) in base; Relentless Pursuit + [2] + 1 rainbow. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 4, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, RP_EQUIPMENT, "rpEquip")
    .hand(P1, RELENTLESS_PURSUIT, "pursuit");
}

/**
 * Drive until the granted "you may move me to my base" opt-in appears for P1 (returns true) or the game is back in an open
 * main phase (false): passes priority/focus, answers the spell's destination with `dest`, declines the Equipment attach.
 */
async function driveToConquerOffer(game: Game, dest?: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      return false;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "runner" && d.source?.pendingChoiceType === "opt-in") {
      expect(d.timing).toBe("FIN"); // the granted "When I conquer, you may …" is a trigger finalized on the chain
      return true;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.no(); // the optional Equipment attach (none to attach anyway)
    } else if (d.kind === "pick" && d.seat === P1 && dest !== undefined && d.options.some((o) => o.key === dest)) {
      await game.p1.pick(dest);
    } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
    } else {
      return false;
    }
  }
  return false;
}

describe("Ruling 0572984acd852191 — Relentless Pursuit's granted conquer trigger lasts the whole turn (fires on every conquer)", () => {
  test("first conquer: Pursuit moves the Runner onto empty bf1 → P1 conquers (1 point) → the granted 'you may move me to my base' is offered; yes → Runner back in base", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["runner", "rpEquip"] });
    expect(await driveToConquerOffer(game, "battlefield-bf1")).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").isReady).toBe(true); // moved by effects only — never exhausted
  });

  test("SAME TURN, second conquer: the Runner then standard-moves onto empty bf2 → conquers again (2 points) → the granted trigger is offered AGAIN; yes → back to base once more", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["runner", "rpEquip"] });
    expect(await driveToConquerOffer(game, "battlefield-bf1")).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    await game.p1.move("runner", "bf2");
    expect(await driveToConquerOffer(game)).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("'this turn' only: on P1's NEXT turn the Runner conquering bf1 again gets no such offer and stays on the battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["runner", "rpEquip"] });
    expect(await driveToConquerOffer(game, "battlefield-bf1")).toBe(true);
    await game.p1.yes();
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null); // lapsed when the Runner left
    await game.p1.move("runner", "bf1");
    expect(await driveToConquerOffer(game)).toBe(false);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
