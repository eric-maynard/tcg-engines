/**
 * Interaction: The Ruination (unl-180-219) · Spell · Order · 9+[order]x3 · Action — "Kill all units."
 *   × Ruined Rex         (unl-067-219) · Unit · Mind · 6+[mind] · 6 Might — "[Deathknell] Deal 4 to an enemy unit."
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6+[fury] · 6 Might —
 *     "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *
 * Rules: 808.1.d.2 / 428.1.a.1.b (Deathknells are queued as pending items before the unit leaves the
 * board), 370.1.a.2 (one 'kill all' action = simultaneous deaths), 337.1 / 337.3 / 337.4 (ALL pending
 * items are finalized — targets chosen — before any resolves), 355.5 (specific choices are made at
 * finalization), 323.4 / 323.5 (cleanup ordering for death triggers).
 *
 * Question: P1's Ruined Rex and P2's Ferrous Forerunner (P2's only unit) die together to The Ruination.
 * Can Rex's Deathknell choose one of the Mech tokens Forerunner is about to create?
 *   → No. Rex must pick its target when its trigger is finalized; the Mechs only exist once Forerunner's
 *     Deathknell RESOLVES, which is strictly later. P2 controls no unit at that moment → Rex's trigger
 *     does nothing; P2 then gets two undamaged 3-Might Mechs.
 *   Positive contrast: if the Mechs already exist when Rex dies, Rex may target one and deal 4 (kills it).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THE_RUINATION = "unl-180-219";
const RUINED_REX = "unl-067-219";
const FERROUS_FORERUNNER = "sfd-021-221";

/** Inline 1-energy action spell: deal 6 to a unit (kills a 6-Might unit on its own). */
const SMITE = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Smite",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: Rex (P1) at bf1, Forerunner (P2) alone in P2's base, P1 holds The Ruination fully funded. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P2, "base", FERROUS_FORERUNNER, "forerunner")
    .hand(P1, THE_RUINATION, "ruin");
}

function p2Mechs(game: Game): string[] {
  return game.cardsAt("base", P2).filter((id) => game.state(id).cardType === "unit" && game.state(id).name === "Mech");
}

describe("The Ruination × Ruined Rex × Ferrous Forerunner — Deathknell targets are locked in before any Deathknell resolves", () => {
  test("setup: P2's ONLY unit is Ferrous Forerunner; The Ruination costs 9 + 3 order", async () => {
    const game = await board().build();
    expect(game.p2.units()).toEqual(["forerunner"]);
    expect(game.p1.units()).toEqual(["rex"]);
    await game.p1.cast("ruin");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ruin"]);
  });

  test("The Ruination kills both units in one action: Rex and Forerunner both end in their owners' trash (370.1.a.2)", async () => {
    const game = await board().build();
    await game.p1.cast("ruin");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(game.p1.trash()).toContain("rex");
    expect(game.p2.trash()).toContain("forerunner");
    expect(game.zoneOf("ruin")).toBe("trash");
  });

  test("timing: right after The Ruination resolves both units are already off the board, Forerunner's Deathknell is on the chain UNRESOLVED and no Mech exists yet (808.1.d.2, 337)", async () => {
    const game = await board().build();
    await game.p1.cast("ruin");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ruination resolves; death triggers are queued/finalized, none resolved
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "forerunner", triggered: true }));
    expect(p2Mechs(game)).toEqual([]); // this is the moment Rex's target would have to be chosen
    expect(game.p2.units()).toEqual([]);
  });

  test("answer: Rex's Deathknell finds NO enemy unit to choose — P1 is never prompted for a target and nothing of P2's takes damage", async () => {
    const game = await board().build();
    await game.p1.cast("ruin");
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // no dangling 'choose an enemy unit' prompt
    expect(game.decision()?.kind).toBe("action");
    for (const id of game.cardsAt("base", P2)) {
      expect(game.state(id).damage).toBe(0);
    }
    expect(game.chain()).toEqual([]);
  });

  test("…then Forerunner's Deathknell resolves: P2 gets exactly two 3-Might Mech tokens in base, undamaged and alive", async () => {
    const game = await board().build();
    await game.p1.cast("ruin");
    await game.settle();
    const mechs = p2Mechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ might: 3, damage: 0, isToken: true, controller: P2, zone: "base" });
    }
    expect(game.p2.units()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("same outcome when P2 is the one who casts The Ruination on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 9, power: { order: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RUINED_REX, "rex")
      .unit(P2, "base", FERROUS_FORERUNNER, "forerunner")
      .hand(P2, THE_RUINATION, "ruin")
      .build();
    await game.p2.cast("ruin");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    const mechs = p2Mechs(game);
    expect(mechs).toHaveLength(2);
    expect(mechs.every((m) => game.state(m).damage === 0)).toBe(true);
  });

  test("contrast: Forerunner died in an EARLIER chain (Mechs exist), then The Ruination kills Rex AND the Mechs together — again no surviving enemy for Rex; tokens cease to exist", async () => {
    const game = await board().resources(P1, { energy: 10, power: { order: 3 } }).hand(P1, SMITE, "smite").build();
    await game.p1.cast("smite", { targets: "forerunner" });
    await game.settle();
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(p2Mechs(game)).toHaveLength(2);
    await game.p1.cast("ruin");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(p2Mechs(game)).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p2.trash().filter((id) => id.startsWith("token-"))).toEqual([]); // rule 186.1: tokens vanish
  });

  // Expected (808, 355.5): with two Mechs (and nothing else of P2's) already on the board, Rex dying alone
  // triggers its Deathknell; P1 is asked to choose an ENEMY unit — the Mechs are offered, Rex's own side is
  // not — and the chosen 3-Might Mech takes 4 and dies (token ceases to exist). Actual: Ruined Rex's
  // Deathknell never triggers — no prompt, no damage; both Mechs survive.
  test.failing("BUG: positive contrast — Mechs already exist when Rex dies alone: Rex's Deathknell lets P1 pick a Mech, deals 4 and kills it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RUINED_REX, "rex")
      .unit(P1, "base", { might: 2, name: "P1 Bystander" }, "ally")
      .unit(P2, "base", FERROUS_FORERUNNER, "forerunner")
      .hand(P1, SMITE, "smite1")
      .hand(P1, SMITE, "smite2")
      .build();
    // Earlier, fully resolved chain: Forerunner dies → two Mechs.
    await game.p1.cast("smite1", { targets: "forerunner" });
    await game.settle();
    const mechs = p2Mechs(game);
    expect(mechs).toHaveLength(2);
    // Now Rex dies on its own.
    await game.p1.cast("smite2", { targets: "rex" });
    const settled = await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered.sort()).toEqual([...mechs].sort()); // enemy units only; not "ally"
    const victim = mechs[0] as string;
    await game.p1.pick(victim);
    await game.settle();
    expect(game.has(victim) && game.zoneOf(victim) === "base").toBe(false); // 4 ≥ 3: killed, token gone
    expect(p2Mechs(game)).toHaveLength(1);
    expect(game.state("ally").damage).toBe(0);
  });
});
