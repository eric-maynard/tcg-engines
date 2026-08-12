/**
 * Ruling 4283ca02526c0650 — Relentless Pursuit (SFD-184 → sfd-184-221) · [Action] · [2][rainbow]
 *   "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn,
 *    that unit has 'When I conquer, you may move me to my base.'"
 *
 * Q: Can Lucian's signature spell be played with no Equipment in play?
 * A: No. Both objects — a friendly unit AND an Equipment you control — are chosen as the spell is
 *    played, even though the attaching itself is optional at resolution. With no Equipment there is
 *    nothing to name, so the spell cannot be played. The unit moves and gains the conquer ability
 *    either way.
 * Rules: 355.7/355.9 (objects are chosen when the spell is played and must match the descriptor),
 *        383.3.a.3 / 204.3.b (a later "you may" is decided at RESOLUTION — the decision, not the object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const BRUTALIZER = "sfd-042-221"; // a plain Equipment, +1 Might

/** P1's turn with [2][rainbow], a Hunter in base, an empty battlefield to move to; the Equipment is optional per case. */
function board(opts: { equipment?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter")
    .hand(P1, RELENTLESS_PURSUIT, "rp");
  return opts.equipment ? s.gear(P1, BRUTALIZER, "brut") : s;
}

const castable = (game: Game) => game.p1.can("cast", "rp");

/** Everything the spell asks to have named as it is played. */
function namedAtCast(game: Game): string[] {
  const field = game.p1.option("cast", "rp")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flat().map(String))];
}

/**
 * Cast on the Hunter and drive the whole line by hand: both pass priority, the Equipment is asked for
 * at RESOLUTION (this is where the engine puts it), then the move opens a non-combat showdown at bf1
 * and the granted "When I conquer, you may move me to my base" is offered.
 */
async function resolveOnHunter(game: Game, opts: { attach: boolean; goHome?: boolean }): Promise<{ askedForEquipment: boolean; askedToGoHome: boolean }> {
  // rule 355.5 / 355.12 — BOTH objects are named as the spell is cast; only the
  // attaching itself waits for resolution (383.3.a.3).
  await game.p1.cast("rp", { targets: ["hunter", "brut"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  let askedForEquipment = false;
  const equip = game.decision();
  if (equip?.kind === "pick" && equip.seat === P1) {
    askedForEquipment = true;
    expect(equip.timing).toBe("RES");
    expect(equip.allowDecline).toBe(true);
    expect(equip.options.map((o) => String(o.card ?? o.key))).toEqual(["brut"]);
    await (opts.attach ? game.p1.pick("brut") : game.p1.decline());
  }
  await game.p1.passFocus();
  await game.p2.passFocus();
  let askedToGoHome = false;
  const home = game.decision();
  if (home?.kind === "yes-no" && home.seat === P1) {
    askedToGoHome = true;
    await (opts.goHome ? game.p1.yes() : game.p1.no());
  }
  await game.settle();
  return { askedForEquipment, askedToGoHome };
}

describe("Ruling 4283ca02526c0650 — Relentless Pursuit and its Equipment", () => {
  // Expected (ruling): the Equipment is one of the spell's chosen objects, so with none in play the
  // spell may not be played at all. Actual: the engine only names the unit at play time and leaves the
  // Equipment to be picked during resolution, so it happily casts with no Equipment anywhere.
  test("ruling 4283ca02526c0650 — with a friendly unit but NO Equipment the spell is unplayable", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    expect(castable(game)).toBe(false);
  });

  // Same cause: "an Equipment with the same controller" should be checked when the spell is played.
  test("ruling 4283ca02526c0650 — only the OPPONENT owns an Equipment, so the spell is still unplayable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter")
      .gear(P2, BRUTALIZER, "theirs")
      .hand(P1, RELENTLESS_PURSUIT, "rp")
      .build();
    expect(game.p1.can("cast", "rp")).toBe(false);
  });

  // `targets` names the PAIR (unit, Equipment) at play time (355.5 / 355.12).
  test("the Equipment is named as the spell is cast, alongside the unit", async () => {
    const game = await board({ equipment: true }).build();
    expect(castable(game)).toBe(true);
    expect(namedAtCast(game)).toContain("hunter");
    expect(namedAtCast(game)).toContain("brut");
  });

  test("the attaching itself really is optional — declining it still moves the unit (and conquers the open battlefield)", async () => {
    const game = await board({ equipment: true }).build();
    const { askedForEquipment } = await resolveOnHunter(game, { attach: false });
    expect(askedForEquipment).toBe(true);
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.state("brut").attachedTo).toBeUndefined();
    expect(game.state("hunter").might).toBe(3);
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("accepting it attaches the Equipment to the very unit that moved (3 + 1 + 2 'attached this turn' = 6)", async () => {
    const game = await board({ equipment: true }).build();
    await resolveOnHunter(game, { attach: true });
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.state("brut").attachedTo).toBe("hunter");
    expect(game.state("hunter").might).toBe(6);
  });

  test("with no Equipment at all there is nothing to name, so the unit never moves — the spell cannot be played (355.7/355.9)", async () => {
    const game = await board().build();
    expect(castable(game)).toBe(false);
    expect(game.locationOf("hunter")).toBe("base");
    expect(game.zoneOf("rp")).toBe("hand");
  });

  test("the unit gains the conquer ability either way: declining the attach, its conquer of bf1 still offers 'you may move me to my base' — and taking it sends it home", async () => {
    const game = await board({ equipment: true }).build();
    const { askedToGoHome } = await resolveOnHunter(game, { attach: false, goHome: true });
    expect(askedToGoHome).toBe(true);
    expect(game.locationOf("hunter")).toBe("base");
    expect(game.p1.points()).toBe(1); // the conquer had already scored
  });

  test("…and declining that offer leaves it holding the battlefield it just took", async () => {
    const game = await board({ equipment: true }).build();
    const { askedToGoHome } = await resolveOnHunter(game, { attach: true, goHome: false });
    expect(askedToGoHome).toBe(true);
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
