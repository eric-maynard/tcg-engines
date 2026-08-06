/**
 * Ruling edfd3defc2005bb9 — Baited Hook (OGN-242 → ogn-242-298, Gear)
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish
 *    a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its
 *    cost. Then recycle the rest."
 *   Example from the ruling: the killed unit is Ruined Rex (unl-067-219, 6 Might, "[Deathknell] — Deal 4
 *   to an enemy unit"). Played unit here: Cloud Drake (ven-048-166, 5 Might, "When you play me, draw 1").
 *
 * Q: Does the killed unit's Deathknell resolve before or after the unit played by Baited Hook (and that
 *    unit's triggers)?
 * A: AFTER. The Deathknell is appended to the chain as a pending item while Hook is still resolving
 *    (before the look-at-5), the banished unit is appended above it; pending items finalize in append
 *    order (Deathknell target chosen first, then the unit picks a location and enters the board, its
 *    play trigger lands on top), and the chain then resolves newest-first: play trigger → … → Deathknell.
 * Rules: 354.2, 354.3, 428.1.a.1.b, 808.1.d.2, 337.1, 337.1.b, 337.2, 355.5, 383.4.a.2, 340.1, 340.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const RUINED_REX = "unl-067-219"; // 6 Might — [Deathknell] Deal 4 to an enemy unit
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might — [Deathknell] Draw 1
const CLOUD_DRAKE = "ven-048-166"; // 5 Might — When you play me, draw 1
const LECTURING_YORDLE = "ogn-087-298"; // 2 Might — [Tank] When you play me, draw 1
const SKULKER = "ogn-175-298"; // vanilla 3-Might filler

/** P1: Hook + the Deathknell unit in base, exactly [1][order]; P2: one 5-Might unit (the Deathknell's only enemy target). */
function board(killed: string, played: string) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", killed, "dk")
    .unit(P2, "base", { might: 5, name: "Enemy Victim" }, "victim")
    .deck(P1, [played, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["played", "r1", "r2", "r3", "r4", "below"]);
}

const ids = (game: Game) => game.chain().map((i) => `${i.cardId}${i.triggered ? "*" : ""}`);

/** Activate Hook and let it start resolving (both pass); if the engine asks which friendly unit to kill, answer "dk". */
async function activateHook(game: Game): Promise<void> {
  await game.p1.activate("hook");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-target") {
    expect(d.seat).toBe(P1);
    await game.p1.pick("dk");
  }
}

describe("Ruling edfd3defc2005bb9 — Baited Hook: killed unit's Deathknell resolves after the played unit and its triggers", () => {
  test("(generic Deathknell) the dies-trigger is appended as a pending item DURING Hook's resolution — it is already on the chain when the look-at-5 choice is offered (354.3, 808.1.d.2)", async () => {
    const game = await board(WATCHFUL_SENTRY, LECTURING_YORDLE).build();
    await activateHook(game);
    // Hook killed the Sentry and is now mid-resolution, asking about the top 5 …
    expect(game.zoneOf("dk")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.source?.cardId).toBe("hook");
    // … while the Sentry's Deathknell already sits on the chain as a pending item, unresolved (no draw yet).
    expect(ids(game)).toEqual(["dk*"]);
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("played");
    expect(offered).not.toContain("below"); // only the top 5 are looked at
  });

  // Expected (ruling steps 3–8 with a target-less Deathknell): picking Lecturing Yordle banishes it and appends
  // it above the Sentry trigger; it finalizes (location) and enters the board; its "draw 1" play trigger lands
  // on top and resolves FIRST; the Sentry's Deathknell draw resolves LAST. Actual: Hook's pick simply draws
  // the chosen card to hand — nothing is banished or played, so no play trigger ever exists.
  test.failing("BUG: ruling edfd3defc2005bb9 — (Sentry/Yordle) the picked unit is played above the Deathknell; its play trigger resolves before the Deathknell (engine draws the picked card instead of playing it)", async () => {
    const game = await board(WATCHFUL_SENTRY, LECTURING_YORDLE).build();
    const handBefore = game.p1.hand().length;
    await activateHook(game);
    expect(ids(game)).toEqual(["dk*"]);
    await game.p1.pick("played");
    // The unit was banished-then-played: it is a pending chain item above the Deathknell, not a card in hand.
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.zoneOf("played")).not.toBe("hand");
    // Rest recycled: "below" is the new top.
    expect(game.p1.deck()[0]).toBe("below");
    // Finalization in append order: Sentry trigger needs no choices; the Yordle's owner picks its location.
    let d = game.decision();
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      expect(d.seat).toBe(P1);
      await game.p1.pick("base");
    }
    expect(game.locationOf("played")).toBe("base");
    // Its play trigger is now the newest item, above the Sentry's Deathknell.
    expect(ids(game)).toEqual(["dk*", "played*"]);
    // Newest first: one round of passes resolves the Yordle's draw; the Deathknell is still waiting.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(ids(game)).toEqual(["dk*"]);
    // Then the Deathknell resolves last.
    d = game.decision();
    expect(d).toMatchObject({ kind: "action", context: "chain" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    expect(game.chain()).toEqual([]);
  });

  // Expected — the ruling's own example, step by step:
  //  1–2. Hook kills Ruined Rex; Rex's Deathknell is appended as a pending item on top of the resolving Hook.
  //  3.   P1 looks at the top 5, banishes Cloud Drake (5 ≤ 6+1) and plays it: a second pending item ABOVE Rex's.
  //  4.   The rest are recycled; Hook finishes.
  //  5.   Pending items finalize in append order: Rex's Deathknell first — P1 chooses its enemy target NOW.
  //  6.   Cloud Drake finalizes next (P1 chooses its location) and enters the board immediately.
  //  7.   Drake's "When you play me, draw 1" is appended above Rex's Deathknell.
  //  8.   Resolution newest-first: Drake's draw resolves first; Rex's 4 damage resolves LAST.
  // Actual: Ruined Rex's keyword-only Deathknell never triggers, and Hook draws the picked card instead of
  // banishing/playing it.
  test.failing("BUG: ruling edfd3defc2005bb9 — (Ruined Rex/Cloud Drake) Deathknell finalizes first but resolves after the played unit's play trigger (engine: Rex never triggers; Hook draws instead of plays)", async () => {
    const game = await board(RUINED_REX, CLOUD_DRAKE).build();
    const handBefore = game.p1.hand().length;
    await activateHook(game);
    // Steps 1–2: Rex is dead and its Deathknell is pending while Hook keeps resolving.
    expect(game.zoneOf("dk")).toBe("trash");
    expect(ids(game)).toEqual(["dk*"]);
    expect(game.state("victim").damage).toBe(0);
    // Step 3: the look-at-5 offers Cloud Drake (5 Might ≤ 7); P1 takes it.
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("played");
    expect(game.zoneOf("played")).not.toBe("hand");
    expect(game.p1.hand()).toHaveLength(handBefore);
    // Step 4: rest recycled.
    expect(game.p1.deck()[0]).toBe("below");
    // Step 5: Rex's Deathknell (appended first) finalizes first — its enemy target is chosen now, by P1.
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const targets = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(targets).toContain("victim");
    await game.p1.pick("victim");
    expect(game.state("victim").damage).toBe(0); // chosen, not yet resolved
    // Step 6: Cloud Drake finalizes next — location choice — and enters the board at once (337.2).
    d = game.decision();
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      expect(d.seat).toBe(P1);
      await game.p1.pick("base");
    }
    expect(game.locationOf("played")).toBe("base");
    expect(game.p1.energy()).toBe(0); // played ignoring its cost
    // Step 7: Drake's play trigger sits above Rex's Deathknell.
    expect(ids(game)).toEqual(["dk*", "played*"]);
    // Step 8: newest first — Drake draws 1 while the victim is still undamaged …
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("victim").damage).toBe(0);
    expect(ids(game)).toEqual(["dk*"]);
    // … and Rex's Deathknell — appended before any of this — resolves last for 4.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("victim").damage).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  // The premise of steps 1–2 for the ruling's own example. Expected: Rex in trash and one pending Rex item on
  // the chain when Hook's look-at-5 prompt appears. Actual: Rex dies but nothing is put on the chain.
  test.failing("BUG: ruling edfd3defc2005bb9 — Ruined Rex killed by Hook puts its Deathknell on the chain before the look-at-5 (engine: Rex's Deathknell never triggers)", async () => {
    const game = await board(RUINED_REX, CLOUD_DRAKE).build();
    await activateHook(game);
    expect(game.zoneOf("dk")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(ids(game)).toEqual(["dk*"]);
  });
});
