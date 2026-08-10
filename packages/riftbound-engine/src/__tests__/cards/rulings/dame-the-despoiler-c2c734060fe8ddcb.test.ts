/**
 * Ruling c2c734060fe8ddcb — Dame the Despoiler (VEN-079 → ven-079-166) · Unit · Body · [5] · 5 Might
 *   "[Empower] [5][body] … [Empowered][>] When I attack or defend, choose a unit here. Increase my Might to its Might this
 *    turn, then give me +1 [Might] this turn."
 *
 * Q: Are you required to use Dame's ability when she defends?
 * A: Yes. The trigger has no "may" — it must go on the chain when she gains the Defender designation, and on resolution
 *    you must choose a unit at that battlefield, raise her Might to its Might, and give her +1. It cannot be declined.
 * Rules: 383.3.a (only "you may" triggers are optional), 464.2.c/e (defend designation → defend triggers on the initial
 *        chain), 477.3 (increase-to), 402 (choices at finalization are mandatory).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAME = "ven-079-166";

/** P2's turn. P1 holds bf1 with an EMPOWERED Dame (5); P2's 7-Might Raider attacks from base. */
function board(empowered = true) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DAME, "dame", empowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might: 7, name: "Raider" }, "raider");
}

/** Raider attacks; walk until P1 is asked something (or the showdown opens), never answering for P1. */
async function attackUntilP1Asked(): Promise<{ game: Game; sawYesNo: boolean; pick: Extract<Decision, { kind: "pick" }> | undefined }> {
  const game = await board().build();
  expect(game.state("dame")).toMatchObject({ isEmpowered: true, might: 5 });
  await game.p2.move("raider", "bf1");
  let sawYesNo = false;
  let pick: Extract<Decision, { kind: "pick" }> | undefined;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) break;
    if (d.kind === "yes-no" && d.seat === P1) {
      sawYesNo = true;
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      pick = d;
      break;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  return { game, pick, sawYesNo };
}

describe("Ruling c2c734060fe8ddcb — Empowered Dame's defend trigger is mandatory", () => {
  test("she becomes a Defender and her trigger is placed on the chain WITHOUT any yes/no offer — P1 is never asked whether to use it", async () => {
    const { game, sawYesNo } = await attackUntilP1Asked();
    expect(game.state("dame").combatRole).toBe("defender");
    expect(sawYesNo).toBe(false);
    // The item exists (either still on the chain awaiting its choice, or already asking for it).
    const onChain = game.chain().some((c) => c.cardId === "dame" && c.triggered && c.controller === P1);
    expect(onChain || game.decision()?.kind === "pick").toBe(true);
  });

  test("the 'choose a unit here' is a REQUIRED pick for P1 (Dame's controller, even on P2's turn): options are exactly the units at bf1, and it cannot be declined", async () => {
    const { pick } = await attackUntilP1Asked();
    expect(pick).toBeDefined();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    expect(pick?.allowDecline).toBe(false);
    expect(pick?.options.map((o) => o.card ?? o.key).sort()).toEqual(["dame", "raider"]);
  });

  test("declining is not an answer the harness will accept for that pick", async () => {
    const { game, pick } = await attackUntilP1Asked();
    expect(pick).toBeDefined();
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(false);
  });

  test("resolving it as required — choose the 7-Might Raider: Dame 5 → 7 → 8 this turn; 8 kills the Raider, she survives 7 damage and P1 keeps bf1", async () => {
    const { game } = await attackUntilP1Asked();
    await game.p1.pick("raider");
    // right after resolution, before combat damage: she is 8
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) break;
      await game.seat(d.seat).pass();
    }
    expect(game.state("dame").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("dame")).toMatchObject({ damage: 0, might: 8, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an UN-empowered Dame defending triggers nothing at all (the ability is [Empowered]-gated, not optional) — no chain item, no prompt, she dies 5-into-7", async () => {
    const game = await board(false).build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("dame")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
