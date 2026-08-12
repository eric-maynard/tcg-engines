/**
 * Ruling e23d4e16c72b1600 — Ahri, Inquisitive (OGN-119 → ogn-119-298) · Champion Unit · Mind · [3] · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me
 *     with a spell or ability.)"
 *
 * Q: Does Ahri's ability TARGET, and does it therefore make the opponent's [Deflect] apply?
 * A: Yes — "give an enemy unit here …" is a specific choice, i.e. a target, so choosing a [Deflect] unit with
 *    it costs the extra [rainbow]. Choosing a unit without [Deflect] costs nothing; if the surcharge cannot be
 *    paid at all, that unit is simply not a choice you can make.
 * Rules: 355.10 (a choice an effect requires is a target), 809.1.c.1 ([Deflect] surcharge owed at pick time),
 *        809.1.d (an unfundable surcharge is not a legal choice), 383.3.b/402.2 (a trigger's target is named
 *        at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI_INQUISITIVE = "ogn-119-298";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn. P2 holds bf1 with a [Deflect] Pouty Poro (2) and a plain Grunt (3).
 * Ahri (3) stands ready in P1's base; `power` is what P1 has in the pool to pay a [Deflect] tax with.
 */
function board(opts: { grunt?: boolean; power?: number } = {}) {
  const s = scenario()
    .resources(P1, { energy: 0, power: opts.power ? { fury: opts.power } : {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P1, "base", AHRI_INQUISITIVE, "ahri");
  if (opts.grunt !== false) {
    s.unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt");
  }
  return s;
}

/** Ahri attacks bf1; her "when I attack" trigger is finalized, so its target pick is open. */
async function attack(game: Game): Promise<void> {
  await game.p1.move("ahri", "bf1");
  expect(game.state("ahri").combatRole).toBe("attacker");
}

describe("Ruling e23d4e16c72b1600 — Ahri's ability targets, so [Deflect] taxes it", () => {
  test("the trigger asks P1 to CHOOSE its enemy unit (a target decision at finalization), listing both enemies", async () => {
    const game = await board({ power: 1 }).build();
    await attack(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(new Set(offered)).toEqual(new Set(["poro", "grunt"]));
  });

  test("ruling: the [Deflect] Poro carries a [rainbow] surcharge on that pick; the plain Grunt carries none", async () => {
    const game = await board({ power: 1 }).build();
    await attack(game);
    const d = game.decision();
    const poro = d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "poro") : undefined;
    const grunt = d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "grunt") : undefined;
    expect(poro?.deflect ?? 0).toBe(1);
    expect(grunt?.deflect ?? 0).toBe(0);
  });

  test("choosing the Poro spends the power and applies -2 to a minimum of 1", async () => {
    const game = await board({ power: 1 }).build();
    await attack(game);
    await game.p1.pick("poro");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.power("fury")).toBe(0); // the [rainbow] tax was paid
    expect(game.state("poro").might).toBe(1); // 2 − 2, floored at 1
    expect(game.state("grunt").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("choosing the untaxed Grunt instead leaves the power in the pool", async () => {
    const game = await board({ power: 1 }).build();
    await attack(game);
    await game.p1.pick("grunt");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("grunt").might).toBe(1); // 3 − 2
    expect(game.state("poro").might).toBe(2);
  });

  test("with no power at all the taxed Poro is not offered — the Grunt is the only choice left (355.10.d.2: still a prompt)", async () => {
    const game = await board({ power: 0 }).interactive().build();
    await attack(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, soleOption: true });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["grunt"]);
    await game.p1.pick("grunt");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("grunt").might).toBe(1);
    expect(game.state("poro").might).toBe(2);
  });

  test("nuance: unpayable is the same as declining — with the Poro the ONLY enemy and no power, nothing is chosen and its Might is untouched", async () => {
    const game = await board({ grunt: false, power: 0 }).build();
    await attack(game);
    const d = game.decision();
    expect(d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "poro")).toBe(false);
    await game.settle();
    expect(game.state("poro").might).toBe(2); // never chosen ⇒ never reduced
    expect(game.violations()).toEqual([]);
  });
});
