/**
 * Interaction: Jax, Unmatched (sfd-054-221) · Champion unit · Calm · 5 · 5 Might
 *     "[Deflect] … Your Equipment everywhere have [Quick-Draw]. (Each gains [Reaction]. When you play
 *      it, attach it to a unit you control.)"
 *   × Doran's Shield (sfd-033-221) · Equipment · Calm · 1 · +1 · "[Equip] [calm]" · Effect: [Tank]
 *     — NO printed Quick-Draw / Reaction
 *   × Wind and Ghosts (ven-106-166) · Spell · Chaos · 3+[chaos] · "[Action] Choose a unit at a
 *     battlefield. If it has 3 [Might] or less, banish it. Otherwise, return it to its owner's hand."
 *
 * Rules: 819.1.b/819.1.d/819.3 (Quick-Draw = Reaction on the card + attach-on-play; a characteristic of
 * the gear), 813.2/813.4/813.5 (Reaction granted by ANOTHER object's passive: the card has Reaction only
 * while the condition holds; Reaction only ever ADDS windows), 338.1.a.2 + 309.1.a + 358.4 (legally timed
 * in a Closed state = has Reaction, checked when played), 337.2 (a finalized Gear resolves immediately —
 * no response window to the gear itself), 343.1.a/343.1.b + 313.1.a (by default no card / no card
 * ability may be played in a Showdown state, Focus or not), 310.1.a (default timing: own turn, Neutral
 * Open), 346 (combat), 809.1.c (Deflect surcharge paid by P2 to choose Jax).
 *
 * Question — P2's turn; P1 holds bf1 with Jax (5) + Squire (2); P1 has Doran's Shield in hand with
 * exactly 1 energy + 1 calm. P2 attacks bf1 with A (6), plays Wind and Ghosts on Jax (paying the Deflect
 * pip) and passes priority:
 *  (a) P1 holds priority in Showdown Closed with Jax still on the board — is the Shield a legal play, what
 *      happens when it is played, and does Jax leaving afterwards matter?
 *  (b) P1 passes instead; W&G resolves (Jax → hand); chain empties, Focus passes to P1 (Showdown Open):
 *      is the Shield offered? its [Equip]? can Jax be replayed?
 *  (c) Baseline: P1's own main phase, no Jax anywhere — is the Shield playable?
 *
 * Expected: (a) yes — the Shield HAS Reaction right now (813.4/813.5); P1 pays 1, the gear resolves at
 * once (337.2), the Quick-Draw attach lands on Squire (3 Might, Tank); Jax bouncing afterwards undoes
 * nothing (358.4). (b) no / no / no — with Jax in hand the Shield is a plain gear (343.1.a, 313.1.a),
 * [Equip] is a plain activated ability (343.1.b), Jax has no Reaction; combat A 6 vs Squire → Squire
 * dies, P2 conquers bf1. (c) yes — default timing needs no permissive keyword (310.1.a, 813.2).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const JAX = "sfd-054-221";
const DORANS_SHIELD = "sfd-033-221";
const WIND_AND_GHOSTS = "ven-106-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn. P1 controls bf1 with Jax (5) + Squire (2) and holds Doran's Shield with exactly 1 energy +
 * 1 calm. P2 has A (6) in base, Wind and Ghosts in hand and 3 energy + 2 chaos (the spell's [chaos] pip
 * plus one spare power for Jax's Deflect surcharge).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", JAX, "jax")
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 6, name: "A" }, "a")
    .hand(P1, DORANS_SHIELD, "shield")
    .hand(P2, WIND_AND_GHOSTS, "wg");
}

/** P2 attacks bf1 with A, casts Wind and Ghosts on Jax (pays Deflect) and passes priority → P1 holds priority, Showdown Closed. */
async function windOnJaxP1Priority(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("a", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("wg", { targets: "jax" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** (b) line: P1 passes too → Wind and Ghosts resolves, Jax bounces, chain empties, Focus passes to P1 (Showdown Open). */
async function jaxBouncedP1Focus(): Promise<Game> {
  const game = await windOnJaxP1Priority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("jax")).toBe("hand");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("setup — P2's attack and the Deflect-taxed Wind and Ghosts", () => {
  test("Wind and Ghosts offers Jax (with the Deflect pip affordable); choosing him costs 3 energy + [chaos] + 1 extra power (809.1.c) and puts the spell on the chain targeting Jax", async () => {
    const game = await board().build();
    await game.p2.move("a", "bf1");
    const offered = (game.p2.option("cast", "wg")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(offered.map((t) => t[0]).sort()).toEqual(["a", "jax", "squire"]);
    await game.p2.cast("wg", { targets: "jax" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wg", controller: P2, targets: ["jax"], triggered: false })]);
  });

  test("while Jax is on the board the Shield IN HAND already carries Quick-Draw as a characteristic ('everywhere', 819.3, 813.5)", async () => {
    const game = await board().build();
    expect(game.zoneOf("shield")).toBe("hand");
    expect(game.state("shield").keywords).toContain("Quick-Draw");
  });
});

describe("(a) P1 holds priority in Showdown Closed, Jax still on the board", () => {
  test("Doran's Shield is a legal play right now — it currently HAS Reaction via Jax's grant (813.4, 338.1.a.2, 309.1.a)", async () => {
    const game = await windOnJaxP1Priority();
    expect(game.zoneOf("jax")).toBe("battlefield-bf1");
    expect(game.state("shield").keywords).toContain("Quick-Draw");
    expect(game.p1.can("play", "shield")).toBe(true);
    // …but its [Equip] activated ability is NOT what gained Reaction (343.1.b): no equipCard / activate option.
    expect(game.p1.legal().some((o) => o.moveId === "equipCard" || o.moveId === "activateAbility")).toBe(false);
  });

  test("playing it: P1 pays exactly 1 energy (the [calm] Equip cost is not involved), the gear never becomes a chain item (337.2) and Wind and Ghosts is still the only thing pending", async () => {
    const game = await windOnJaxP1Priority();
    await game.p1.play("shield", { answers: ["squire"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.zoneOf("shield")).not.toBe("hand");
    expect(game.zoneOf("shield")).not.toBe("chain");
    expect(game.chain().some((i) => i.cardId === "shield" && !i.triggered)).toBe(false);
    expect(game.chain().map((i) => i.cardId)).toContain("wg");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the Quick-Draw attach (819.1.d) lands on the unit P1 names — Squire: 2 + 1 = 3 Might and it now has [Tank]", async () => {
    const game = await windOnJaxP1Priority();
    await game.p1.play("shield", { answers: ["squire"] });
    // Drain only a possible attach-trigger item; Wind and Ghosts must stay pending for this assertion.
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("shield").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["shield"]);
    expect(game.state("squire").might).toBe(3);
    expect(game.state("squire").keywords).toContain("Tank");
    expect(game.zoneOf("jax")).toBe("battlefield-bf1"); // W&G has not resolved yet
  });

  test("Jax leaving afterwards does not retroactively undo the play (358.4): W&G resolves, Jax (5 > 3) returns to P1's hand, the Shield loses Quick-Draw but stays attached to Squire (3)", async () => {
    const game = await windOnJaxP1Priority();
    await game.p1.play("shield", { answers: ["squire"] });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("jax")).toBe("hand");
    expect(game.p1.hand()).toContain("jax");
    expect(game.p1.banishment()).not.toContain("jax");
    expect(game.state("shield").keywords).not.toContain("Quick-Draw"); // the grant is gone with Jax…
    expect(game.state("shield").attachedTo).toBe("squire"); // …but the attachment stands
    expect(game.state("squire").might).toBe(3);
  });

  test("combat then proceeds A (6) vs Squire (3, Tank): Squire dies, the Shield falls off to P1's base, A survives and P2 conquers bf1 (346)", async () => {
    const game = await windOnJaxP1Priority();
    await game.p1.play("shield", { answers: ["squire"] });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P1 passes; Wind and Ghosts resolves first — Jax is in hand when Focus reaches P1", () => {
  test("with Jax off the board the Shield is an ordinary gear again: no Quick-Draw, NOT offered even though P1 holds Focus (343.1.a, 313.1.a) — the play is rejected", async () => {
    const game = await jaxBouncedP1Focus();
    expect(game.state("shield").keywords).not.toContain("Quick-Draw");
    expect(game.p1.can("play", "shield")).toBe(false);
    expect((await game.p1.try((p) => p.play("shield", { answers: ["squire"] }))).ok).toBe(false);
    expect(game.zoneOf("shield")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("its [Equip] ability is a plain activated ability — not usable in a showdown either (343.1.b)", async () => {
    const game = await jaxBouncedP1Focus();
    expect(game.p1.legal().some((o) => o.moveId === "equipCard" || o.moveId === "activateAbility")).toBe(false);
  });

  test("Jax himself has no Reaction/Action — he cannot be replayed into the showdown; P1's whole menu is pass/concede", async () => {
    const game = await jaxBouncedP1Focus();
    expect(game.p1.can("play", "jax")).toBe(false);
    expect((await game.p1.try((p) => p.play("jax", { to: "bf1" }))).ok).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passFocus"]);
  });

  test("combat: A (6) vs the bare Squire (2) → Squire dies, P2 conquers bf1 and scores; the Shield never left P1's hand", async () => {
    const game = await jaxBouncedP1Focus();
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("shield")).toBe("hand");
    expect(game.zoneOf("jax")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) baseline — P1's own main phase, no Jax anywhere", () => {
  function ownTurn() {
    return scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
      .hand(P1, DORANS_SHIELD, "shield");
  }

  test("the Shield has no Quick-Draw, yet is playable at default timing (310.1.a — Reaction/Quick-Draw only ever ADD windows, 813.2)", async () => {
    const game = await ownTurn().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("shield").keywords).not.toContain("Quick-Draw");
    expect(game.p1.can("play", "shield")).toBe(true);
  });

  test("played WITHOUT Quick-Draw it simply enters P1's base unattached for 1 energy (no attach-on-play); Squire stays 2", async () => {
    const game = await ownTurn().build();
    await game.p1.play("shield");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.state("squire").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
