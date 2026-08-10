/**
 * Ruling 01e74404467175d8 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · [2] · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Vi, Peacekeeper (unl-176-219) · 5 Might "[Ambush] When I attack, [Stun] an enemy unit here."
 *
 * Q: Vi attacks a battlefield with an Overzealous Fan. Does the Fan's ability resolve first so Vi's stun fizzles?
 * A: Yes. Both triggers hit the Initial Chain — attacker's (Vi) first, defender's (Fan) on top. The Fan's controller opts
 *    in by killing the Fan up front (a cost); LIFO the Fan's ability resolves first and moves Vi to base; Vi's trigger
 *    then resolves but she is no longer "here", so nothing is stunned.
 * Rules: 459 (initial chain order: attacker then defender), 383.3.b / 204.3.a ("kill me to" = cost at finalization),
 *        340 (LIFO), 359.3.f.4 ("here" needs the source at the battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const VI = "unl-176-219";

/** P1's turn. Vi ready in P1's base. P2 holds bf1 with the Overzealous Fan (2) and a Grunt (3). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .unit(P1, "base", VI, "vi");
}

const isFanOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Vi attacks bf1; P1 aims her stun at the Grunt; P2 accepts the Fan (killing it) and names Vi. Stops at the first chain priority window. */
async function viAttacksIntoFan(): Promise<{ game: Game; fanAskedAtFin: boolean }> {
  const game = await board().build();
  await game.p1.move("vi", "bf1");
  expect(game.state("vi").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  let fanAskedAtFin = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "grunt")?.key ?? "grunt");
    } else if (isFanOffer(d)) {
      fanAskedAtFin = (d as Decision).timing === "FIN";
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "vi")?.key ?? d.options[0]!.key);
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return { fanAskedAtFin, game };
}

describe("Ruling 01e74404467175d8 — Overzealous Fan bounces the attacking Vi before her stun resolves; the stun whiffs", () => {
  test("initial chain: Vi's attack trigger (P1, → Grunt) at the bottom, the Fan's defend trigger (P2) on top; the Fan was killed UP FRONT as the cost when P2 opted in", async () => {
    const { game, fanAskedAtFin } = await viAttacksIntoFan();
    expect(fanAskedAtFin).toBe(true);
    expect(game.zoneOf("fan")).toBe("trash"); // cost paid before anything resolved
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "vi", controller: P1, targets: ["grunt"], triggered: true }),
      expect.objectContaining({ cardId: "fan", controller: P2, triggered: true }),
    ]);
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("grunt").isStunned).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("LIFO: the Fan's ability resolves first — Vi is moved to P1's base — with Vi's trigger still on the chain", async () => {
    const { game } = await viAttacksIntoFan();
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("vi")).toBe("base");
    expect(game.state("vi").combatRole).not.toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: true })]);
    expect(game.state("grunt").isStunned).toBe(false);
  });

  test("Vi's trigger then resolves without its source 'here': the Grunt is NOT stunned; the attack fizzles out and bf1 stays P2's with the Grunt", async () => {
    const { game } = await viAttacksIntoFan();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").isStunned).toBe(false);
    await game.settle();
    expect(game.state("grunt").isStunned).toBe(false);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 declines the Fan: Vi stays, her trigger resolves at bf1 and the Grunt IS stunned", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bf1");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("grunt");
      } else if (isFanOffer(d)) {
        await game.p2.no();
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("grunt").isStunned).toBe(true);
  });
});
