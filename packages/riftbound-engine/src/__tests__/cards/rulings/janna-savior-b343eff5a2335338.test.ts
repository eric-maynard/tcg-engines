/**
 * Ruling b343eff5a2335338 — Janna, Savior (SFD-053 → sfd-053-221) · [Reaction] Champion Unit · Calm · [3][calm]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me with
 *     a spell or ability.)"
 *
 * Q: Does Janna's "move up to one enemy unit" count as CHOOSING it — i.e. does it owe the [Deflect] surcharge?
 * A: Yes. The ability makes you select a specific enemy unit, which is a choice for [Deflect]'s purposes, so the
 *    [rainbow] surcharge is a mandatory additional cost paid when you name that unit. Declining the (optional)
 *    move costs nothing, and a unit you cannot afford the surcharge for cannot be chosen at all.
 * Rules: 355.7 / 809.1.c.1 ([Deflect] is charged when the object is chosen), 383.3.b / 402.2 (a trigger's
 *        targets and their costs are settled at finalization), 355.10.d.2 (an optional "up to one" stays
 *        declinable).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA_SAVIOR = "sfd-053-221";
const POUTY_PORO = "ogn-013-298";

/** P1's turn 3. P1 holds bf1 with a damaged Holder; P2's Poro is there. `spare` = power beyond Janna's own [calm]. */
function board(spare: number) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { calm: 1, rainbow: spare } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder", { damage: 1 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .hand(P1, JANNA_SAVIOR, "janna");
}

/** Play Janna into bf1 and stop on her trigger's target prompt. */
async function playJanna(game: Game): Promise<Decision> {
  await game.p1.play("janna", { to: "bf1" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d!;
}

/** Drain the chain by passing priority. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
}

describe("Ruling b343eff5a2335338 — Janna's 'move up to one enemy unit' is a choice, so [Deflect] must be paid", () => {
  test("the prompt shows the [Deflect] unit with its surcharge attached, and the move is declinable", async () => {
    const game = await board(2).build();
    const d = await playJanna(game);
    expect(d.kind === "pick" ? d.options.map((o) => ({ card: o.card, deflect: o.deflect })) : []).toEqual([
      { card: "poro", deflect: 1 },
    ]);
    expect(d.kind === "pick" ? d.min : 1).toBe(0); // "up to one"
  });

  test("ruling: naming the Poro charges the [rainbow] surcharge on top of Janna's own [3][calm]", async () => {
    const game = await board(2).build();
    await playJanna(game);
    await game.p1.pick("poro");
    await drain(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, rainbow: 1 } }); // 5−3 energy, Janna's [calm], one [rainbow] for [Deflect]
    expect(game.locationOf("poro")).toBe("base"); // moved home
    expect(game.state("holder").damage).toBe(0); // and the heal happened
    expect(game.violations()).toEqual([]);
  });

  test("declining the optional move pays no surcharge at all: only Janna's own cost leaves the pool", async () => {
    const game = await board(2).build();
    await playJanna(game);
    await game.p1.decline();
    await drain(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, rainbow: 2 } });
    expect(game.locationOf("poro")).toBe("bf1");
  });

  test("an enemy unit WITHOUT [Deflect] is free to choose — no surcharge is listed and none is paid", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 5, power: { calm: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .hand(P1, JANNA_SAVIOR, "janna")
      .build();
    const d = await playJanna(game);
    expect(d.kind === "pick" ? d.options.map((o) => o.deflect ?? 0) : []).toEqual([0]);
    await game.p1.pick("plain");
    await drain(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, rainbow: 2 } });
    expect(game.locationOf("plain")).toBe("base");
  });

  test("with no [rainbow] left the Poro cannot be chosen at all — the surcharge is mandatory, so it is not on the menu", async () => {
    const game = await board(0).build();
    await game.p1.play("janna", { to: "bf1" });
    const d = game.decision();
    const options = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(options).not.toContain("poro");
    await drain(game);
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
