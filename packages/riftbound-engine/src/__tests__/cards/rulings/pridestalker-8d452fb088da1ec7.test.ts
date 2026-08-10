/**
 * Ruling 8d452fb088da1ec7 — Pridestalker (Rengar legend, UNL-183 → unl-183-219) "When you play a unit, give a unit +1
 *   [Might] this turn."
 *   × Emperor's Dais (SFD-207 → sfd-207-221, Battlefield) "When you conquer here, you may pay [1] and return a unit you
 *     control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here."
 *
 * Q: Does Pridestalker trigger when Emperor's Dais plays a Sand Soldier token?
 * A: Yes. The Dais says "play" a token; playing a token unit counts as playing a unit even though a token is not a card, so
 *    "When you play a unit" triggers.
 * Rules: 182–186 (tokens are game objects that are played when created), 383.4.a ("when you play" triggers), Emperor's
 *        Dais optional pay-[1]-and-return cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRIDESTALKER = "unl-183-219";
const EMPERORS_DAIS = "sfd-207-221";

/** P1 (Rengar — Pridestalker) with exactly [1]; Emperor's Dais uncontrolled and live; P1's A (2) and B (2) in base; P2 idle. */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "pride")
    .resources(P1, { energy: 1 })
    .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false, owner: P1 })
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b")
    .unit(P2, "base", { might: 2, name: "Z" }, "z");
}

const sandSoldiers = (game: Game) => game.cardsAt("dais").filter((c) => game.state(c).name === "Sand Soldier");

/**
 * A + B walk onto the empty Dais, both pass Focus → P1 conquers; P1 opts into the Dais at finalization (383.3.a) and names A
 * as the unit to return (402.2); both pass; as the item RESOLVES P1 pays the [1] (205 / 444.2), A returns, and the Sand
 * Soldier token is played here.
 */
async function conquerDaisAndMakeSoldier(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["a", "b"], "dais");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
  await game.p1.yes();
  const ret = game.decision();
  expect(ret).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
  expect(ret?.kind === "pick" ? ret.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a", "b"]);
  await game.p1.pick("a");
  expect(game.p1.energy()).toBe(1); // nothing paid yet
  expect(game.zoneOf("a")).toBe("battlefield-dais"); // chosen, not yet returned
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, targets: ["a"], triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Dais resolves → pay [1]? → yes → A returns → Sand Soldier token is PLAYED here
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "RES" });
  await game.p1.yes();
  expect(game.p1.energy()).toBe(0);
  expect(game.zoneOf("a")).toBe("hand");
  expect(sandSoldiers(game)).toHaveLength(1);
  return game;
}

describe("Ruling 8d452fb088da1ec7 — Pridestalker triggers off Emperor's Dais's Sand Soldier token", () => {
  test("the token being played puts a Pridestalker 'When you play a unit' item on the chain for P1, and P1 is asked to choose its '+1 Might' unit (the fresh Sand Soldier is among the choices)", async () => {
    const game = await conquerDaisAndMakeSoldier();
    const soldier = sandSoldiers(game)[0] as string;
    expect(game.state(soldier)).toMatchObject({ controller: P1, isToken: true, might: 2, zone: "battlefield-dais" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pride" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(expect.arrayContaining([soldier, "b"]));
    await game.p1.pick(soldier);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pride", controller: P1, targets: [soldier], triggered: true })]);
  });

  test("resolution: the chosen Sand Soldier gets +1 [Might] this turn (2 → 3); next turn it is 2 again", async () => {
    const game = await conquerDaisAndMakeSoldier();
    const soldier = sandSoldiers(game)[0] as string;
    await game.p1.pick(soldier);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state(soldier)).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.state("b").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state(soldier).might).toBe(2);
  });

  test("contrast: declining the Dais (no token played) leaves Pridestalker silent — no pick, no chain item, B stays 2", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b"], "dais");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
    await game.p1.no();
    await game.settle();
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.state("a").might).toBe(2);
    expect(game.state("b").might).toBe(2);
    expect(game.p1.energy()).toBe(1);
  });
});
