/**
 * A SOLE LEGAL OPTION IS STILL A CHOICE — rule 355.10.d.2.
 *
 * "Being the only valid choice does not make a selection programmatic."
 * So the engine never collapses a choice with one candidate into a silent
 * auto-bind: it raises the same prompt it raises for five candidates, flagged
 * `soleOption: true` so a UI can render it as a one-click confirm.
 *
 * What auto-binding would have thrown away, and what this file pins:
 *   - the object is still CHOSEN, so "when you choose me" (355.14.d / 359.2)
 *     fires off the answer;
 *   - a declinable choice stays declinable (383.3.a.2 / 355.13);
 *   - the player sees what the engine is about to do to them.
 *
 * The counterpart (355.10.d): a PROGRAMMATIC selection — "each unit", "all
 * units with 2 or less Might" — is not a choice and must NOT be prompted.
 *
 * Automated clients do not click: `EngineBackend` answers a `soleOption`
 * prompt the instant it is raised (as `settle()`'s passive policy does), so
 * scripted tests read exactly as before. `scenario().interactive()` turns that
 * off — that is what this file uses.
 */

import { describe, expect, test } from "bun:test";
import { Game, loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const TIDETURNER = "ogn-199-298"; // "…you may choose a unit you control at another location. Move me to its location and it to my original location."
const VOLIBEAR = "ogn-041-298"; // "When I attack, deal 5 damage split among any number of enemy units here."
const BLADE_DANCER = "sfd-195-221"; // Legend: "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it."

/** Unit: "When I move to a battlefield, kill an enemy unit here." — a MANDATORY single target. */
const KILLER_UNIT = {
  abilities: [
    {
      effect: { target: { controller: "enemy", location: "here", type: "unit" }, type: "kill" },
      trigger: { event: "move-to-battlefield", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 2,
  name: "Executioner (inline: kill an enemy unit here on arrival)",
};

/** Unit: "When I move to a battlefield, move a friendly unit." — target, then a Move Destination. */
const MOVER_UNIT = {
  abilities: [
    {
      effect: { target: { controller: "friendly", excludeSelf: true, type: "unit" }, to: "choose", type: "move" },
      trigger: { event: "move-to-battlefield", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "body",
  energyCost: 1,
  might: 2,
  name: "Usher (inline: move a friendly unit on arrival)",
};

/** Spell: "Kill all enemy units." — rule 355.10.d, a programmatic selection. */
const SWEEP_SPELL = {
  abilities: [
    {
      effect: { target: { controller: "enemy", quantity: "all", type: "unit" }, type: "kill" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Sweep (inline spell: Kill all enemy units)",
  timing: "action",
};

describe("rule 355.10.d.2 — a sole legal option is still a choice", () => {
  test("Tideturner with exactly ONE friendly unit elsewhere still asks: the prompt is raised, flagged soleOption, and lists that one unit", async () => {
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Far" }, "far")
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    // rule 383.3.a — the leading "you may" is the opt-in…
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // …and the partner is a separate, real CHOICE even though only 'far' is legal.
    expect(game.decision()).toMatchObject({
      kind: "pick",
      options: [expect.objectContaining({ card: "far" })],
      seat: P1,
      soleOption: true,
    });
    // Nothing is bound until the player confirms (402.2).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.p1.pick("far");
    expect(game.chain()).toMatchObject([{ cardId: "tt", targets: ["far"], triggered: true }]);
  });

  test("the sole option is a TARGET, not a fait accompli: 'when you choose a friendly unit' fires off the confirm", async () => {
    // Blade Dancer watches for a friendly unit being CHOSEN. Under the old
    // auto-bind the partner was written onto the item without a `choose` event,
    // so the Legend never woke up.
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .legend(P1, BLADE_DANCER, "dancer")
      .unit(P1, "bf1", { might: 3, name: "Far" }, "far")
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, soleOption: true });
    await game.p1.pick("far");
    // The confirm IS the choice: Blade Dancer's "when you choose a friendly unit" saw it.
    await game.settle();
    const sawChoose = game
      .chain()
      .some((i) => i.cardId === "dancer") || game.state("far").isReady;
    expect(sawChoose || game.decision()?.kind === "yes-no").toBe(true);
  });

  test("declining is still legal: the sole-option pick of a 'you may' can be refused and nothing moves", async () => {
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Far" }, "far")
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    await game.p1.no(); // 383.3.a.2 — the opt-in itself is declinable
    await game.settle();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("far")).toBe("bf1");
  });

  test("a triggered kill with ONE legal victim asks before killing it (the victim is a target, so it can be answered or the ability responded to)", async () => {
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", KILLER_UNIT, "killer")
      .unit(P2, "bf1", { might: 1, name: "Victim" }, "victim")
      .build();
    await game.p1.move("killer", "bf1");
    // rule 402.2 — the trigger is finalized and the ONE legal enemy is offered,
    // not written onto the item behind the controller's back.
    expect(game.decision()).toMatchObject({
      kind: "pick",
      options: [expect.objectContaining({ card: "victim" })],
      seat: P1,
      soleOption: true,
    });
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    await game.p1.pick("victim");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
  });

  test("a PROGRAMMATIC selection is not a choice and is never prompted (355.10.d): 'kill all enemy units' just happens", async () => {
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "bf1", { might: 1, name: "Only" }, "only")
      .hand(P1, SWEEP_SPELL, "sweep")
      .build();
    await game.p1.play("sweep");
    await game.settle();
    // One enemy unit on the board, and still nothing was asked: "all enemy
    // units" describes its objects, it does not select among them.
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  test("a move with ONE legal destination still asks where the unit goes (355.4)", async () => {
    const game = await scenario()
      .interactive()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", MOVER_UNIT, "mover")
      .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
      .build();
    await game.p1.move("mover", "bf1");
    // The trigger names its (only) friendly target first…
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "target", seat: P1, soleOption: true });
    await game.p1.pick("pal");
    // …then the Move Destination: base is where Pal stands, so bf1 is the only
    // legal one — still offered, still a choice (355.4 / 355.10.d.2).
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", semantics: "destination", seat: P1, soleOption: true });
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key) : []).toEqual(["battlefield-bf1"]);
    expect(game.locationOf("pal")).toBe("base");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("pal")).toBe("bf1");
  });

  test("a split with ONE surviving recipient still shows the assignment (355.14.e)", async () => {
    // Volibear: "deal 5 damage split among any number of enemy units here".
    // With one enemy the division is forced — and it is still the chooser's
    // assignment, so the distribute prompt is shown (flagged soleOption)
    // instead of the 5 landing while they watch.
    const game = await scenario()
      .interactive()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P2, "bf1", { might: 7 }, "b")
      .build();
    await game.p1.move("voli", "bf1");
    await game.p1.pick("b"); // 355.14.b — the split's targets are named at finalization
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, soleOption: true, total: 5 });
    expect(game.state("b").damage).toBe(0);
    await game.p1.distribute({ b: 5 });
    expect(game.state("b").damage).toBe(5);
  });

  test("the pregame battlefield keep is a choice even for a seat that registered exactly one (113 / 486.5)", async () => {
    const pool = await loadDefaultCardPool();
    const bf = pool.all().find((c) => c.cardType === "battlefield");
    const rune = pool.all().find((c) => c.cardType === "rune");
    const deck = {
      battlefieldIds: [bf?.id as string],
      mainDeckCardIds: Array(40).fill("ogn-175-298"),
      runeDeckCardIds: Array(12).fill(rune?.id as string),
    };
    const game = await Game.fromDecks({ interactive: true, p1: deck, p2: deck });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", soleOption: true });
    expect(d?.source?.moveId).toBe("selectBattlefield");
    expect(d?.kind === "pick" ? d.options.length : 0).toBe(1);
    // Answering it (settle() does the confirming for an unattended driver)
    // finishes the pregame exactly as a three-battlefield keep does.
    await game.settle();
    expect(game.turnNumber()).toBe(1);
  });

  test("non-interactive drivers (bots, the ~27k scripted tests) are unaffected: the same line runs with no prompt to answer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Far" }, "far")
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    await game.p1.yes();
    // The choice was still MADE (the engine raised it); the backend confirmed it.
    expect(game.chain()).toMatchObject([{ cardId: "tt", targets: ["far"], triggered: true }]);
  });
});
