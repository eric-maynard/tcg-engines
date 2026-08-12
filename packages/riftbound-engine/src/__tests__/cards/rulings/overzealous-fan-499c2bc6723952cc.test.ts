/**
 * Ruling 499c2bc6723952cc — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *   × Vi, Hotheaded (UNL-030 → unl-030-219) · Unit · 3 Might · "[Deflect]".
 *
 * Q: Do you have to pay the [Deflect] cost for Overzealous Fan's ability?
 * A: Yes. The target is chosen as the trigger is finalized on the chain, and if that attacker has [Deflect] the
 *    surcharge is a mandatory additional cost paid right then. If you cannot (or will not) pay it, that unit
 *    simply is not a legal pick.
 * Rules: 809.1.c ([Deflect] surcharge per choice), 402.2 (targets chosen at finalization), 383.3.b / 204.3.a
 *        (a leading "you may [cost] to" is the ability's BASE cost, paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const VI_HOTHEADED = "unl-030-219";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with the Fan (2) behind a 9-Might [Tank] Wall; P2 attacks with Deflect-Vi (3) and a Raider (2). */
function board(rainbow: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 0, power: { rainbow } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "bf1", { keywords: ["Tank"], might: 9, name: "Wall" }, "wall")
    .unit(P2, "base", VI_HOTHEADED, "vi")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider");
}

/** Resolve the top chain item by passing priority for whoever holds it, twice. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** P2 attacks with both; the Fan's "when I defend" trigger asks P1 whether to use it. */
async function attackedAndAsked(rainbow: number): Promise<Game> {
  const game = await board(rainbow).build();
  await game.p2.move(["vi", "raider"], "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fan" } });
  return game;
}

describe("Ruling 499c2bc6723952cc — the Fan's target is chosen on the chain, and a [Deflect] attacker costs extra to pick", () => {
  test("the optional trigger is offered to P1 when the Fan gains the Defender designation", async () => {
    await attackedAndAsked(1);
  });

  // RULING-CONFLICT: riftjudge 499c2bc6723952cc says the "kill me" part is paid at RESOLUTION, not at the
  // targeting step; CR 383.3.b + 204.3.a (which names Overzealous Fan) say a leading "you may [cost] to X" is the
  // ability's BASE cost and is paid when the item is finalized — engine follows CR.
  test("accepting pays the base cost at once: the Fan is already in the trash while the ability is still on the chain", async () => {
    const game = await attackedAndAsked(1);
    await game.p1.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
  });

  test("ruling: the target is picked right then, and the [Deflect] attacker is offered with its mandatory surcharge", async () => {
    const game = await attackedAndAsked(1);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const opts = (d as Pick).options;
    expect(opts.map((o) => String(o.card ?? o.key)).toSorted()).toEqual(["raider", "vi"]);
    expect(opts.find((o) => o.card === "vi")).toMatchObject({ deflect: 1 });
    expect(opts.find((o) => o.card === "raider")?.deflect).toBeUndefined();
  });

  test("ruling: picking the [Deflect] unit spends the [rainbow]; it is then moved to its base", async () => {
    const game = await attackedAndAsked(1);
    await game.p1.yes();
    await game.p1.pick("vi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await resolveTop(game);
    expect(game.locationOf("vi")).toBe("base");
    expect(game.state("vi").combatRole).toBeNull();
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with no [rainbow] the surcharge cannot be paid, so Vi is not a legal pick at all — only the plain Raider", async () => {
    const game = await attackedAndAsked(0);
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => String(o.card ?? o.key))).toEqual(["raider"]);
      await game.p1.pick("raider");
    }
    await resolveTop(game);
    expect(game.locationOf("raider")).toBe("base"); // the only affordable choice was taken
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
