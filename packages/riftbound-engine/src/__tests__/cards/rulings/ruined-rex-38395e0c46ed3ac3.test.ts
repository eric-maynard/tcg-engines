/**
 * Ruling 38395e0c46ed3ac3 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might
 *   "[Deathknell] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *   × Draven, Audacious (sfd-148-221) — the opponent's only unit, with [Deflect].
 *   × Deathgrip (sfd-163-221) — used only to kill Rex on demand.
 *
 * Q: Rex dies and my opponent's ONLY unit has [Deflect]. Can I decline to trigger the Deathknell, or
 *    refuse to target that unit?
 * A: No to both — the Deathknell has no "may", so it triggers, and the only legal enemy unit must be
 *    taken as its target when the trigger finalizes. But [Deflect] adds a cost to the trigger, and a
 *    triggered ability's cost may be declined: decline and the item leaves the Chain without resolving.
 * Rules: 808.1 (Deathknell is mandatory), 402.2 (a sole legal object is taken), 809.1.c ([Deflect]
 *        surcharge), 404.2 (an unpaid trigger cost removes the item from the Chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const DRAVEN_AUDACIOUS = "sfd-148-221"; // 6 Might, [Deflect]
const DEATHGRIP = "sfd-163-221";

/** P1's Rex (plus a spare so Deathgrip's rider has somewhere to go); P2's lone Deflect unit at bf1. */
function board(enemy: string | { might: number; name: string }) {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf1", enemy, "foe")
    .hand(P1, DEATHGRIP, "grip");
}

/** Kill Rex with Deathgrip and let the Chain settle down to the Deathknell item. */
async function killRex(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.cast("grip", { targets: "rex", answers: ["pal"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
}

describe("Ruling 38395e0c46ed3ac3 — Ruined Rex's Deathknell is mandatory, but its [Deflect] cost may be declined", () => {
  test("the Deathknell fires and takes the sole enemy unit automatically — no 'do you want to trigger?' and no target choice", async () => {
    const game = await board(DRAVEN_AUDACIOUS).build();
    expect(game.state("foe").keywords).toContain("Deflect");

    await killRex(game);
    // The trigger IS on the Chain; the only question asked is the Deflect payment.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rex", controller: P1, triggered: true, type: "ability" }),
    ]);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.prompt).toContain("Deflect");
    expect(d?.source?.cardId).toBe("rex");
  });

  test("declining the [Deflect] cost removes the Deathknell from the Chain: no damage, no Power spent", async () => {
    const game = await board(DRAVEN_AUDACIOUS).build();
    await killRex(game);
    await game.p1.no();

    expect(game.chain()).toEqual([]);
    expect(game.state("foe").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p1.power("rainbow")).toBe(2); // nothing paid
    await game.settle();
    expect(game.state("foe").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("paying it instead: 1 [rainbow] leaves the pool and the 6-Might Deflect unit takes its 4", async () => {
    const game = await board(DRAVEN_AUDACIOUS).build();
    await killRex(game);
    await game.p1.yes();
    await game.settle();

    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("foe").damage).toBe(4);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // 4 < 6 Might
    expect(game.violations()).toEqual([]);
  });

  test("control — the same lone enemy without [Deflect]: nothing is asked at all and the 4 lands automatically", async () => {
    const game = await board({ might: 6, name: "Plain" }).build();
    await killRex(game);
    expect(game.decision()).toMatchObject({ kind: "action" }); // no yes/no
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
    expect(game.p1.power("rainbow")).toBe(2);
  });
});
