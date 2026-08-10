/**
 * Ruling 4948f041aa587688 — Fiora, Peerless (SFD-110 → sfd-110-221) · 3 Might · "When I attack or defend one on
 *     one, double my Might this combat."
 *   × Wuju Bladesman (Master Yi legend → ogs-019-024) · "While a friendly unit defends alone, it gets +2 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1."
 *   × an [Ambush] unit (Nidalee, Cat Form — unl-114-219) played into the combat afterwards.
 *
 * Q: Fiora defends alone vs one attacker with Master Yi as my legend; I Discipline her in response to her defend
 *    trigger, let it all resolve, then Ambush a unit into the battlefield. What is Fiora's Might?
 * A: 12. Lone defender: 3 + 2 (Yi) = 5; Discipline → 7; her trigger resolves and doubles the CURRENT 7 → 14; the
 *    Ambush unit means she no longer defends alone so Yi's passive drops (−2) but the doubling already locked in
 *    +7 for the combat: 14 − 2 = 12.
 * Rules: 741.1 (conditional passives are continuously re-evaluated), arithmetic layering of might bonuses,
 *        LIFO resolution of the initial chain, 466.7.c ("this combat" duration).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const WUJU_BLADESMAN = "ogs-019-024";
const DISCIPLINE = "ogn-058-298";
const NIDALEE_CAT_FORM = "unl-114-219"; // [Ambush] 4-Might unit, [3][body]

/**
 * P2's turn. P1 (legend: Wuju Bladesman) holds bf1 with Fiora alone; P2's lone 1-Might Poker attacks.
 * P1 has [5][body]: Discipline (2) + Nidalee (3 + body).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", FIORA, "fiora")
    .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, NIDALEE_CAT_FORM, "nidalee");
}

/** Poker attacks; P1 Disciplines Fiora in response to her defend trigger; the initial chain resolves fully. */
async function defendDisciplineResolve(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora").might).toBe(3);
  await game.p2.move("poker", "bf1");
  // 1–2. Fiora is the lone defender: Yi's passive applies at once (5); her defend trigger is the initial chain.
  expect(game.state("fiora").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
  expect(game.state("fiora").might).toBe(5);
  // 3. P1 reacts with Discipline on Fiora.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("disc", { targets: "fiora" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fiora", "disc"]);
  // 4. LIFO: Discipline resolves first (7), then the trigger doubles the current 7 → 14.
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
  expect(game.state("fiora").might).toBe(7);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("fiora").might).toBe(14);
  return game;
}

describe("Ruling 4948f041aa587688 — Fiora + Master Yi + Discipline, then an Ambush ally: 5 → 7 → 14 → 12", () => {
  test("steps 1–4: lone defender 3+2 = 5; Discipline → 7; the defend trigger doubles the current value → 14", async () => {
    const game = await defendDisciplineResolve();
    expect(game.state("fiora").might).toBe(14);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("step 5: P1 Ambushes Nidalee into bf1 — Fiora no longer defends alone, Yi's +2 switches off, the locked-in doubling stays: 14 − 2 = 12", async () => {
    const game = await defendDisciplineResolve();
    if (game.decision()?.seat === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "nidalee")).toBe(true);
    const where = game.p1.option("playUnit", "nidalee")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(where).toContain("battlefield-bf1"); // Ambush: to a battlefield where you have units
    await game.p1.play("nidalee", { to: "bf1" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["fiora", "nidalee"]);
    expect(game.state("fiora").might).toBe(12);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("after the combat: the 'this combat' doubling and Yi's passive are gone, Discipline's +2 (this turn) remains — Fiora sits at 5 and the 1-Might attacker is dead", async () => {
    const game = await defendDisciplineResolve();
    if (game.decision()?.seat === P2) {
      await game.p2.passFocus();
    }
    await game.p1.play("nidalee", { to: "bf1" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.state("fiora").combatRole).toBeNull();
    expect(game.state("fiora").might).toBe(5); // 3 + Discipline's 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
