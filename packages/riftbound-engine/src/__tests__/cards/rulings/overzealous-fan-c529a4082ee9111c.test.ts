/**
 * Ruling c529a4082ee9111c — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Spell · Calm · 2+[calm] · [Reaction]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Does the Fan's trigger target an enemy unit, can Not So Fast counter it, and if countered does the Fan die?
 * A: Yes it targets (the attacking unit is chosen as part of the effect). Yes, Not So Fast can counter it. When
 *    countered the Fan does NOT die: "kill me" is a cost-within-instruction performed on resolution, and a countered
 *    ability performs none of its instructions.
 * Rules: 355.5 (targets chosen at finalization), 359 (instructions performed on resolution), 425.1 (a countered item
 *        performs nothing), 383.4.f (defend triggers).
 * RULING-CONFLICT on "does the Fan die": pre-Unleashed answer. CR 204.3.a (this card is its example: "In order to finalize
 *    the ability to the chain, its controller must kill Overzealous Fan"), 383.3.b / 740.4.a.2 (a leading "[kill me] TO …"
 *    is the BASE COST, paid at finalization) and 425.1.c (countering refunds no cost) ⇒ the Fan is dead before NSF can be
 *    cast and stays dead; the counter only stops the move. Unleashed-era rulings 347a9365bc85ec43 / a6a4e61cf7a5ceee agree.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const NOT_SO_FAST = "sfd-045-221";

/** P2's turn. P1 (Player A) holds bf1 with the Fan + a 4-Might Wall; P2 (Player B) attacks with a 5-Might Raider holding NSF (2+[calm]). */
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

const isFanKillOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));

/** Raider attacks; P1 finalizes the Fan's trigger choosing the Raider (accepting the opt-in wherever the engine asks it), until P2 holds priority. */
async function fanTriggerOnChainThenP2Priority(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (isFanKillOffer(d)) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "raider")?.key ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain" && d.seat === P1) {
      await game.p1.passPriority();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

async function counterWithNotSoFast(game: Game): Promise<void> {
  await game.p2.cast("nsf");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "nsf"]);
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (isFanKillOffer(d)) {
      await game.p1.yes(); // would only matter if the engine asked on resolution — a countered ability never gets here
    } else {
      await game.acting().passPriority();
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("nsf")).toBe("trash");
}

describe("Ruling c529a4082ee9111c — the Fan's trigger targets; Not So Fast counters it; a countered Fan does not die", () => {
  test("the Fan's trigger is an ability on the chain that CHOOSES the enemy attacker (targets: raider)", async () => {
    const game = await board().build();
    await fanTriggerOnChainThenP2Priority(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, targets: ["raider"], triggered: true })]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // nothing moved yet
  });

  test("Not So Fast may target it (enemy ability choosing P2's friendly Raider) and counters it: the Raider is NOT moved", async () => {
    const game = await board().build();
    await fanTriggerOnChainThenP2Priority(game);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = (game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["fan"]);
    await counterWithNotSoFast(game);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  // RULING-CONFLICT (see header): CR 204.3.a / 404.1 — "kill me" is the FINALIZATION cost, so the Fan is already in the
  // trash when P2 gets to counter; 425.1.c — the counter refunds nothing. Only the Wall is left to fight the Raider.
  test("CR 204.3.a / 425.1.c (contra ruling c529a4082ee9111c) — a countered Fan trigger leaves the Fan DEAD (its kill was paid to finalize) and the Raider unmoved; the Wall then fights alone", async () => {
    const game = await board().build();
    await fanTriggerOnChainThenP2Priority(game);
    expect(game.zoneOf("fan")).toBe("trash"); // paid before P2's window
    await counterWithNotSoFast(game);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual(["wall"]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    // Combat: Raider 5 vs Wall 4 → the Wall dies, P2 conquers bf1.
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("contrast — uncountered: the ability resolves, the Fan is dead and the Raider is back in P2's base", async () => {
    const game = await board().build();
    await fanTriggerOnChainThenP2Priority(game);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (isFanKillOffer(d)) {
        await game.p1.yes();
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
