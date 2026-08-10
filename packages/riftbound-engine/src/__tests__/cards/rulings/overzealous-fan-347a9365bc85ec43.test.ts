/**
 * Ruling 347a9365bc85ec43 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Spell · Calm · 2+[calm] · [Reaction]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: How does the Fan's defend trigger interact with Not So Fast under the current rules — does the Fan survive if
 *    the ability is countered?
 * A: No. "Kill me" is a cost within instructions paid up front to put the trigger on the chain. The opponent can still
 *    counter the ability with Not So Fast (it chooses their attacking unit), but the Fan is already dead. Declining the
 *    "may" means the Fan is not killed and the ability never goes on the chain.
 * Rules: 383.3.a (may → decided at finalization), 383.3.b / 383.3.b.1 (cost within instructions = base cost, paid to
 *        finalize), 383.3.a.2 (declined → removed, never triggered), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const NOT_SO_FAST = "sfd-045-221";

/** P2's turn. P1 defends bf1 with the Fan (2) + Wall (4). P2's Raider (5) attacks; P2 holds Not So Fast with exactly 2+[calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Raider attacks; the Fan's defend trigger is offered; P1 accepts (choosing the Raider if asked). */
async function attackAndAcceptFan(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fan", pendingChoiceType: "opt-in" }, timing: "FIN" });
  expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // still alive while merely offered
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("raider");
  }
}

describe("Ruling 347a9365bc85ec43 — Overzealous Fan pays 'kill me' up front; Not So Fast counters the ability but the Fan stays dead", () => {
  test("accepting the trigger KILLS the Fan immediately as the cost; the ability (targeting the Raider) is now finalized on the chain and nothing has moved yet", async () => {
    const game = await board().build();
    await attackAndAcceptFan(game);
    expect(game.zoneOf("fan")).toBe("trash"); // cost paid at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, targets: ["raider"], triggered: true, type: "ability" })]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 may answer with Not So Fast (the ability is an enemy ability choosing P2's unit): it counters the trigger — the Raider is NOT moved — and the Fan remains in the trash", async () => {
    const game = await board().build();
    await attackAndAcceptFan(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = (game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["fan"]); // the Fan's ability on the chain
    await game.p2.cast("nsf");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "nsf"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // NSF resolves → counters; the countered ability leaves the chain
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // move countered
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.zoneOf("fan")).toBe("trash"); // does NOT survive — the cost was already paid
    expect(game.p1.units("bf1")).toEqual(["wall"]);
    // The combat goes on without the Fan: Raider 5 vs Wall 4.
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("uncountered, for contrast: the ability resolves and the Raider is sent back to P2's base (Fan still dead either way)", async () => {
    const game = await board().build();
    await attackAndAcceptFan(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
  });

  test("declining the 'may': the Fan is NOT killed and no ability is ever put on the chain — nothing for Not So Fast to target", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fan" } });
    await game.p1.no();
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    // P2 gets focus; Not So Fast has nothing legal to counter.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
