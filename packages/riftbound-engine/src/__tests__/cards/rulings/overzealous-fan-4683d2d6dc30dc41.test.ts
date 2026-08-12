/**
 * Ruling 4683d2d6dc30dc41 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · [2] · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: If I use the Fan's ability on an attacking unit with [Deflect], do I have to pay the Deflect cost?
 * A: Yes. Killing the Fan is the ability's COST and involves no targeting; moving an attacking unit is the
 *    EFFECT, and it chooses an opponent's unit — so [Deflect] applies. The choice is made as the ability is
 *    put on the chain, and the Deflect surcharge must be paid then. If you cannot (or will not) pay it, that
 *    unit simply is not a legal choice.
 * Rules: 809.1.c ([Deflect]: opponents pay [rainbow] to choose that unit with a spell or ability),
 *        383.3.b / 402.2 (a triggered ability's cost and its chosen targets are settled at finalization),
 *        404.2 (an unpayable cost means the option is not offered).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";

const SLIPPERY = { keywords: ["Deflect"], might: 5, name: "Slippery" };

/** P1's turn. P2 holds bf1 with the Fan; P1 attacks with a [Deflect] unit and (optionally) a plain one. */
function board(opts: { plain?: boolean; rainbow?: number } = {}) {
  let s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", SLIPPERY, "slip");
  if (opts.plain) {
    s = s.unit(P1, "base", { might: 4, name: "Plain" }, "plain");
  }
  if (opts.rainbow) {
    s = s.resources(P2, { power: { rainbow: opts.rainbow } });
  }
  return s;
}

const optionsOf = (d: Decision | null) => (d?.kind === "pick" ? d.options : []);

describe("Ruling 4683d2d6dc30dc41 — the Overzealous Fan must pay [Deflect] to bounce a Deflecting attacker", () => {
  test("the 'kill me' cost is paid up front and asks for no target; the TARGET question comes next and prices the Deflect unit at [rainbow]", async () => {
    const game = await board({ plain: true, rainbow: 1 }).build();
    await game.p1.move(["slip", "plain"], "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash"); // the cost, paid before anything is chosen
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    expect(optionsOf(d).find((o) => (o.card ?? o.key) === "slip")).toMatchObject({ deflect: 1, surcharge: 1 });
    expect(optionsOf(d).find((o) => (o.card ?? o.key) === "plain")?.deflect).toBeUndefined();
  });

  test("ruling: choosing the Deflecting attacker charges P2 the [rainbow]; the ability then bounces it to P1's base", async () => {
    const game = await board({ plain: true, rainbow: 1 }).build();
    await game.p1.move(["slip", "plain"], "bf1");
    await game.p2.yes();
    await game.p2.pick("slip");
    expect(game.p2.power("rainbow")).toBe(0); // surcharge paid at chain-placement
    await game.settle();
    expect(game.locationOf("slip")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("choosing the NON-Deflecting attacker instead costs nothing", async () => {
    const game = await board({ plain: true, rainbow: 1 }).build();
    await game.p1.move(["slip", "plain"], "bf1");
    await game.p2.yes();
    await game.p2.pick("plain");
    expect(game.p2.power("rainbow")).toBe(1); // untouched
    await game.settle();
    expect(game.locationOf("plain")).toBe("base");
    expect(game.locationOf("slip")).toBe("bf1");
  });

  test("with no [rainbow] to spend the Deflecting attacker drops out of the menu — only the plain attacker can be chosen", async () => {
    const game = await board({ plain: true }).build();
    expect(game.p2.power("rainbow")).toBe(0);
    await game.p1.move(["slip", "plain"], "bf1");
    await game.p2.yes();
    // The sole affordable candidate is bound without a question; either way "slip" is never choosable.
    const d = game.decision();
    expect(optionsOf(d).map((o) => o.card ?? o.key)).not.toContain("slip");
    await game.settle();
    expect(game.locationOf("plain")).toBe("base");
    expect(game.locationOf("slip")).toBe("bf1");
  });

  test("and when the ONLY attacker has [Deflect] and P2 cannot pay, the whole 'you may' cannot be accepted — the Fan survives", async () => {
    const game = await board().build();
    await game.p1.move("slip", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P2 });
    expect((await game.p2.try((p) => p.yes())).ok).toBe(false);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // not killed — the cost was never paid
    expect(game.locationOf("slip")).toBe("bf1");
  });

  test("contrast — the same lone [Deflect] attacker with a [rainbow] available: P2 pays and bounces it", async () => {
    const game = await board({ rainbow: 1 }).build();
    await game.p1.move("slip", "bf1");
    await game.p2.yes();
    expect(game.p2.power("rainbow")).toBe(0);
    expect(game.zoneOf("fan")).toBe("trash");
    await game.settle();
    expect(game.locationOf("slip")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
