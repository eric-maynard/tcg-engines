/**
 * Ruling a80326d6674556fe — Relentless Pursuit (SFD-184 → sfd-184-221) · Spell · [2][rainbow] · [Action]
 *   "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has
 *    'When I conquer, you may move me to my base.'"
 *   × Doran's Blade (SFD-095 → sfd-095-221) · Equipment · [Equip] [body] · +2 [Might].
 *
 * Q: Can I equip an Equipment onto my unit with Relentless Pursuit?
 * A: Yes. You name a friendly unit and an Equipment you control; the unit moves, you MAY attach that Equipment to it,
 *    and it gains "When I conquer, you may move me to my base" this turn. Declining the attach still moves the unit
 *    and still grants the conquer ability. "Same controller" stops you attaching an opponent's Equipment.
 * Rules: 355.4 (move destination chosen at play), 355.10 (choices), 359.3.e.11 (follow instructions as far as possible).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const DORANS_BLADE = "sfd-095-221";
const HEXDRINKER = "sfd-102-221";

/** P1's turn. bf1 is P1's (a holder unit sits there), so the move is not a conquer. Ally in base, Blade unattached. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P1, RELENTLESS_PURSUIT, "rp")
    .resources(P1, { energy: 2, power: { rainbow: 1 } });
}

/** bf1 is NEUTRAL and empty, so the mover conquers it — the granted conquer ability can be observed. */
function neutralBoard() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P1, RELENTLESS_PURSUIT, "rp")
    .resources(P1, { energy: 2, power: { rainbow: 1 } });
}

describe("Ruling a80326d6674556fe — Relentless Pursuit does attach an Equipment to the unit it moves", () => {
  test("the play names the unit; the Equipment is the spell's other choice, offered (declinably) as it resolves", async () => {
    const game = await board().build();
    // rule 355.5 / 355.12 — the play-time list names BOTH objects: the friendly
    // unit and the Equipment that may be attached to it.
    const targets = game.p1.option("cast", "rp")?.fields.find((f) => f.arg === "targets");
    expect(targets?.options).toEqual([["ally", "blade"], ["holder", "blade"]]);
    await game.p1.cast("rp", { targets: ["ally", "blade"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // riftjudge a80326d6674556fe (now FOLLOWED, and it is what the CR says): both
    // the unit AND the Equipment are chosen when the spell is CAST — 355.12, a
    // "you may perform a Game Action on some Game Objects" makes every choice
    // targeted and chosen independently of the decision to perform it. What is
    // left here is only that DECISION (383.3.a.3), so the prompt offers exactly
    // the Equipment already named and stays declinable.
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, min: 1, seat: P1, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["blade"]);
  });

  test("saying yes: the Equipment ends up attached to the unit, which has moved to bf1 (+2 [Might] from the Blade)", async () => {
    const game = await board().build();
    await game.p1.cast("rp", { targets: ["ally", "blade"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("blade");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("blade")).toMatchObject({ attachedTo: "ally", controller: P1 });
    expect(game.state("ally").attachments).toEqual(["blade"]);
    expect(game.state("ally").might).toBe(4); // 2 printed + the Blade's +2
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("declining the attach still moves the unit — the Blade stays unattached in P1's base", async () => {
    const game = await board().build();
    await game.p1.cast("rp", { targets: ["ally", "blade"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline();
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally")).toMatchObject({ attachments: [], might: 2 });
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.zoneOf("blade")).toBe("base");
  });

  test("…and it still gains 'When I conquer, you may move me to my base' — conquering neutral bf1 asks P1 to move back", async () => {
    const game = await neutralBoard().build();
    await game.p1.cast("rp", { targets: ["ally", "blade"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline(); // no attach — the grant is independent of it
    await game.p1.passFocus(); // the arrival opens a showdown at neutral bf1…
    await game.p2.passFocus(); // …which P1 closes alone, conquering it
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ally" } });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("ally")).toBe("base"); // moved itself home
  });

  test("'with the same controller' — an opponent's Equipment is never on the menu", async () => {
    const game = await board().gear(P2, HEXDRINKER, "theirs").build();
    await game.p1.cast("rp", { targets: ["ally", "blade"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["blade"]);
    await game.p1.decline();
    await game.settle();
    expect(game.state("theirs")).toMatchObject({ attachedTo: undefined, controller: P2 });
  });
});
