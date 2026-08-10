/**
 * Ruling 8470eb7c4a1c301d — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · 2 · [Hidden] "If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *   × Tasty Faefolk (OGN-075 → ogn-075-298) · 6 Might "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q: Tasty Faefolk dies during a showdown. Can I play my hidden Zhonya's in response to its Deathknell trigger to save it?
 * A: During a showdown you still control that battlefield until the showdown ends (contested control doesn't change yet), so yes,
 *    the hidden Zhonya's CAN legally be played in response to the Deathknell trigger. Outside a showdown (e.g. killed by a spell) you
 *    lose the battlefield the instant your last unit dies, so the hidden card is gone and can't be played. Nuance: you can't have
 *    both — for the Deathknell to be on the chain the unit has already died, so a Zhonya's flipped THEN no longer replaces that death.
 * Rules: 190.4.c / 107.3.d (control loss and the facedown card; delayed while a showdown is ongoing), 811 (Hidden → Reaction),
 *        366–372 (replacement must exist before the event), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const TASTY_FAEFOLK = "ogn-075-298";
/** P2's removal outside combat: deal 6 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 controls bf1 with a lone Tasty Faefolk (6) and Zhonya's facedown there. P2: Brute (7) in base, Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TASTY_FAEFOLK, "fae")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
    .hand(P2, BOLT, "bolt");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Brute attacks bf1, both pass Focus, combat resolves: Faefolk (6) dies to 7; stop with its Deathknell trigger on the chain. */
async function faefolkDiesInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("fae")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
  return game;
}

/** Bolt kills Faefolk outside any showdown; stop with its Deathknell trigger on the chain. */
async function faefolkDiesToBolt(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "fae" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Bolt resolves
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("bolt")).toBe("trash");
  expect(game.zoneOf("fae")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 8470eb7c4a1c301d — hidden Zhonya's vs Tasty Faefolk's death: playable while control is retained (mid-showdown, or while the Deathknell keeps the state Closed); never both", () => {
  test("in the showdown: with Faefolk dead and its Deathknell on the chain, bf1 is still contested and STILL controlled by P1 — so P1 may legally flip the hidden Zhonya's in response", async () => {
    const game = await faefolkDiesInCombat();
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(["base", "bf1"]).toContain(game.locationOf("zhonya") as string); // it is in play now
    expect(game.p2.energy() + game.p1.energy()).toBe(1); // played for [0]
  });

  test("…but not both: Faefolk had already died for the Deathknell to exist, so the freshly played Zhonya's replaces nothing — Faefolk stays in the trash, the Deathknell resolves (2 runes channeled exhausted, draw 1), then P2 conquers bf1", async () => {
    const game = await faefolkDiesInCombat();
    const runes0 = game.p1.runes().length;
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash"); // not healed/recalled
    expect(game.p1.base()).not.toContain("fae");
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.runes({ ready: false }).length).toBeGreaterThanOrEqual(2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(["base", "bf1"]).toContain(game.locationOf("zhonya") as string); // Zhonya's itself was not "killed instead"
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 8470eb7c4a1c301d (also 070fc7a3b21bd0b1 / 678069c72cf4193e / b43c764cfdfe5b69) says that
  // OUTSIDE a showdown control of bf1 is lost the instant P1's last unit dies, taking the facedown Zhonya's with it before
  // the Deathknell can be responded to. CR 808.1.d.2 (the Deathknell is added to the chain as a Pending Item BEFORE the
  // unit is put in the trash) + 401.1 (a Pending Item makes the state Closed) + 323.6 / 190.4.c (control only lapses in
  // an OPEN State) — and the official clarification 9a32c2cc829f221a ("the same process will occur whenever Glasc
  // Mixologist dies alone at a battlefield … regardless of if there is a Combat there or not"), rulings 8756cad8692a37b8,
  // ab5af1ec075ae219, 5e9dfc8857b334fd — say P1 KEEPS bf1 while the Deathknell is on the chain, so the hidden Zhonya's
  // may still be flipped in response (it just saves nothing: Faefolk is already dead). Control lapses once the chain has
  // emptied. Engine follows CR — battlefield control timing model, operations/battlefield-control.ts.
  test("ruling 8470eb7c4a1c301d (rewritten to CR 808.1.d.2 / 323.6) — outside a showdown, with the Deathknell pending the state is Closed: bf1 is STILL P1's, the hidden Zhonya's is still there and MAY be flipped in response", async () => {
    const game = await faefolkDiesToBolt();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash"); // too late to replace the death
    expect(["base", "bf1"]).toContain(game.locationOf("zhonya") as string);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null }); // rule 323.6 — lapsed once the chain emptied
  });

  test("outside a showdown, once everything has resolved: bf1 is nobody's, the unplayed hidden Zhonya's is in P1's trash, and the Deathknell paid out", async () => {
    const game = await faefolkDiesToBolt();
    const hand0 = game.p1.hand().length;
    await game.p1.passPriority();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["fae", "zhonya"]));
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("contrast — the way to actually save it: flip Zhonya's in response to the SPELL (before Faefolk dies); then the death is replaced — Zhonya's is killed instead, Faefolk healed/exhausted/recalled to base, and no Deathknell", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p2.cast("bolt", { targets: "fae" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.state("fae")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toHaveLength(hand0); // no Deathknell draw
    expect(game.p1.runes()).toHaveLength(runes0); // no Deathknell channel
    expect(game.chain()).toEqual([]);
  });
});
