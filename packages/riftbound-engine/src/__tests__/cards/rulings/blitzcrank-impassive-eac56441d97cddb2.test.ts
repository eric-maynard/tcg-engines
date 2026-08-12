/**
 * Ruling eac56441d97cddb2 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Champion Unit · Calm · [5][calm] · 5 Might
 *     "[Tank] · When you play me to a battlefield, you may move an enemy unit to here. · When I hold, return me to my owner's hand."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · "[Deflect] (Opponents must pay [rainbow] to choose me
 *     with a spell or ability.)"
 *
 * Q: Do you have to pay one power to choose a [Deflect] unit with Blitzcrank's pull?
 * A: Yes. Blitzcrank's ability CHOOSES an enemy unit, i.e. it targets, so [Deflect]'s [rainbow] surcharge is
 *    owed when you pick the Poro. Pulling a unit without [Deflect] costs nothing.
 * Rules: 355.10 (a required specific choice is a target), 809.1.c.1 ([Deflect] surcharge at pick time),
 *        809.1.d (an unfundable surcharge is not a legal choice), 383.3.a.1/402.2 (a "you may …" trigger is
 *        opted into and targeted at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn. P1 controls bf1 (Holder there); P2 holds bf2 with a [Deflect] Pouty Poro (2) and a Grunt (3).
 * Blitzcrank in hand; `spare` = power left over after his [5][calm] to fund a [Deflect] tax.
 */
function board(spare: number) {
  return scenario()
    .resources(P1, { energy: 5, power: spare ? { calm: 1, fury: spare } : { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", POUTY_PORO, "poro")
    .unit(P2, "bf2", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, BLITZCRANK, "blitz");
}

describe("Ruling eac56441d97cddb2 — Blitzcrank's pull targets, so choosing a [Deflect] unit costs [rainbow]", () => {
  test("playing him to bf1 asks the optional pull first (a yes/no for P1 at finalization)", async () => {
    const game = await board(1).build();
    await game.p1.play("blitz", { to: "bf1" });
    expect(game.locationOf("blitz")).toBe("bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("ruling: on accepting, the enemy pick shows the [Deflect] Poro carrying a [rainbow] surcharge and the Grunt carrying none", async () => {
    const game = await board(1).build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const poro = d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "poro") : undefined;
    const grunt = d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "grunt") : undefined;
    expect(poro?.deflect ?? 0).toBe(1);
    expect(grunt?.deflect ?? 0).toBe(0);
  });

  test("pulling the Poro charges the extra power and drags it to Blitzcrank's battlefield", async () => {
    const game = await board(1).build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    await game.p1.pick("poro");
    expect(game.p1.power("fury")).toBe(0); // the [Deflect] tax was paid on the pick
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("pulling the untaxed Grunt instead leaves that power in the pool", async () => {
    const game = await board(1).build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    await game.p1.pick("grunt");
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("grunt")).toBe("bf1");
    expect(game.locationOf("poro")).toBe("bf2");
  });

  test("with nothing left to pay the surcharge the Poro is not a choice at all — only the Grunt is offered", async () => {
    const game = await board(0).interactive().build(); // 355.10.d.2 — surface the lone-candidate prompt
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, soleOption: true });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["grunt"]);
    await game.p1.pick("grunt");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("poro")).toBe("bf2");
  });
});
