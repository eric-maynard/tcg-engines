/**
 * Interaction: Glasc Mixologist (sfd-165-221, 5 Might) "[Deathknell] — You may play a unit with cost
 *   no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Shadow (unl-194-219, 3 energy, 3 Might) "If you play me to a battlefield, I enter ready. …"
 *   × Pridestalker (unl-183-219, legend) "When you play a unit, give a unit +1 [Might] this turn."
 *
 * Question: P2's turn, Open state, no combat. P1 (legend Pridestalker) controls bf1 with Glasc
 * Mixologist as the ONLY unit there; Shadow is in P1's trash. P2 kills Mixologist with a spell.
 *   (a) May P1 put Shadow onto bf1 — now empty of P1 units — on P2's turn, and does it enter READY
 *       there? Does P1 thereby keep bf1 without interruption (no free conquer / no scoring)?
 *   (b) P1 chooses base instead — exhausted?
 *   (c) Does Pridestalker trigger although it is P2's turn and the play came from a Deathknell; who
 *       picks the +1 target; does P2's own "when YOU play a unit" legend see it?
 *   (d) Contrast: Shadow from hand — own turn only, costs 3, ready only when played to a battlefield.
 *
 * Rules: 808.1.d.2 (Deathknell queued as a Pending item before the corpse moves), 309.1 (a chain ⇒
 * Closed state), 323.6 / 190.4.c (control of an empty battlefield is lost only in an OPEN state),
 * 355.2.a (valid locations = base or a battlefield you control), 356.1.b.1 (ignoring cost → 0),
 * 143.4 (units enter exhausted unless stated otherwise — Shadow's self-replacement), 359.2.c,
 * 419.3.a-b / 419.4.a ("play" triggers fire when the play completes, whoever's turn, whatever caused
 * it), 191.1 / 191.4.a (the Deathknell — and the play it makes — belong to P1), 355.5.b (P1 chooses
 * the trigger's target at finalization).
 *
 * Expected: (a) yes — bf1 is still P1's while the chain is up, Shadow lands there READY for free, bf1
 * never changes hands, nobody scores. (b) base: legal, free, EXHAUSTED. Declining is also legal.
 * (c) exactly one Pridestalker item, controlled by P1, P1 picks (Shadow itself eligible); P2's
 * Pridestalker stays silent. (d) from hand: 3 energy, P1's own open turn only; ready iff to a battlefield.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIXOLOGIST = "sfd-165-221";
const SHADOW = "unl-194-219";
const PRIDESTALKER = "unl-183-219";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit — kills the 5-Might Mixologist outright

/**
 * P2's open turn. P1: Pridestalker legend, bf1 held by a lone Mixologist, a 2-Might bystander in
 * base, Shadow in the trash, NO resources (everything must be free). P2: its own Pridestalker
 * legend (the "when YOU play" foil), a 4-Might unit on bf2, Final Spark + 8 energy.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, PRIDESTALKER, "ps")
    .legend(P2, PRIDESTALKER, "ps2")
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", MIXOLOGIST, "gm")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "buddy")
    .unit(P2, "bf2", { might: 4, name: "Enemy Holder" }, "foe")
    .trash(P1, SHADOW, "shadow")
    .hand(P2, FINAL_SPARK, "spark");
}

/** P2 Final-Sparks the Mixologist; both pass; stops at P1's Deathknell "You may" (402.1). */
async function killMixologist(game: Game): Promise<void> {
  await game.p2.cast("spark", { targets: "gm" });
  await game.settle();
  expect(game.zoneOf("gm")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/** Accept the Deathknell, pick Shadow, send it to `dest`; stops at whatever comes next. */
async function replayShadow(game: Game, dest: "base" | "battlefield-bf1"): Promise<void> {
  await game.p1.yes();
  await game.settle(); // priority window on the finalized Deathknell → it resolves → reveal-and-pick
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("shadow");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.answer(dest);
}

const isPsPick = (game: Game): boolean => {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "ps";
};

describe("Glasc Mixologist Deathknell → Shadow from trash, under Pridestalker, on the opponent's turn", () => {
  test("setup: the Deathknell is P1's triggered item on the chain (Closed state, 309.1) and bf1 is STILL P1's although no P1 unit stands there (323.6 / 190.4.c)", async () => {
    const game = await board().build();
    await killMixologist(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gm", controller: P1, triggered: true })]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(a) bf1 — empty of P1 units — is offered as a Valid location for the replayed Shadow alongside base (355.2.a; Mixologist ruling)", async () => {
    const game = await board().build();
    await killMixologist(game);
    await game.p1.yes();
    await game.settle();
    const offer = game.decision() as PickDecision;
    expect(offer.options.map((o) => o.card ?? o.key)).toEqual(["shadow"]); // cost 3, no pips → eligible
    await game.p1.pick("shadow");
    const dest = game.decision() as PickDecision;
    expect(dest.kind).toBe("pick");
    expect(dest.options.map((o) => o.key).toSorted()).toEqual(["base", "battlefield-bf1"]);
    expect(dest.options.map((o) => o.key)).not.toContain("battlefield-bf2"); // P2's battlefield is not a valid location
  });

  test("(a) played to bf1 on P2's turn via the Deathknell: Shadow is on bf1 READY, nothing was paid (356.1.b.1), Mixologist stays in the trash", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "battlefield-bf1");
    expect(game.zoneOf("shadow")).toBe("battlefield-bf1");
    expect(game.state("shadow").isReady).toBe(true);
    expect(game.state("shadow").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("gm")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(a) P1 keeps bf1 without interruption: after everything settles into P2's open main phase bf1 is P1's, uncontested, nobody scored, and P2 has no free conquer of it", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "battlefield-bf1");
    if (isPsPick(game)) {
      await game.p1.pick("shadow");
    }
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.units("bf1")).toEqual(["shadow"]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // P2's only route onto bf1 is a real attack into a defended battlefield — no "conquer"/"score" option exists.
    expect(game.p2.legal().some((o) => o.verb === "conquer" || o.verb === "score")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(b) NO side: choosing base is legal and free, but Shadow enters EXHAUSTED there (143.4 / 359.2.c — the ready clause keys on the destination, not on how it was played); bf1 then falls uncontrolled once the state is Open (323.6)", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "base");
    expect(game.zoneOf("shadow")).toBe("base");
    expect(game.state("shadow").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    if (isPsPick(game)) {
      await game.p1.pick("buddy");
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p2.points()).toBe(0); // losing control is not P2 conquering
  });

  test("(b) 'You may': P1 can decline the whole Deathknell — Shadow stays in the trash, no Pridestalker trigger, bf1 goes uncontrolled", async () => {
    const game = await board().build();
    await killMixologist(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("shadow")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(isPsPick(game)).toBe(false);
    expect(game.state("buddy").might).toBe(2);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(c) Pridestalker triggers exactly ONCE, as P1's item, on P2's turn, off a Deathknell play (419.4.a, 191.4.a) — P1 is asked for the +1 target at finalization (355.5.b) with every unit on board eligible incl. Shadow itself; P2's Pridestalker does NOT trigger", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ps", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "ps2")).toBe(false);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d.source?.cardId).toBe("ps");
    expect(d.allowDecline).toBe(false); // no "may" on Pridestalker
    expect(d.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["buddy", "foe", "shadow"]);
  });

  test("(c) P1 puts the +1 on Shadow itself: after P2 gets priority and passes, Shadow is a READY 4-Might unit on bf1 for the rest of P2's turn; the bonus is gone on P1's next turn", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "battlefield-bf1");
    await game.p1.pick("shadow");
    expect(game.state("shadow").might).toBe(3); // still on the chain
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2 may respond to the trigger
    await game.p2.passPriority();
    expect(game.state("shadow")).toMatchObject({ isReady: true, might: 4, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("buddy").might).toBe(2);
    expect(game.state("foe").might).toBe(4);
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn(); // P2 ends → P1's turn: "this turn" has expired
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("shadow").might).toBe(3);
    expect(game.locationOf("shadow")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(c) P2 never gets a Pridestalker prompt of its own during the whole sequence — the play was P1's, not P2's (191.1)", async () => {
    const game = await board().build();
    await killMixologist(game);
    await replayShadow(game, "battlefield-bf1");
    let p2PsPrompts = 0;
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.source?.cardId === "ps2") {
        p2PsPrompts += 1;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick((d.options.find((o) => o.card === "shadow") ?? d.options[0])?.key as string);
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(p2PsPrompts).toBe(0);
    expect(game.state("foe").might).toBe(4);
  });

  describe("(d) contrast — Shadow from HAND", () => {
    function handBoard(active: typeof P1 | typeof P2 = P1) {
      return scenario()
        .active(active)
        .legend(P1, PRIDESTALKER, "ps")
        .resources(P1, { energy: 3 })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
        .hand(P1, SHADOW, "shadow");
    }

    test("on P2's turn (Open state, P1 has no priority) Shadow is NOT playable from hand — no Ambush/Reaction", async () => {
      const game = await handBoard(P2).build();
      expect(game.p1.can("play", "shadow")).toBe(false);
      expect((await game.p1.try((p) => p.play("shadow", { to: "bf1" }))).ok).toBe(false);
      expect(game.zoneOf("shadow")).toBe("hand");
    });

    test("on P1's own turn it costs the full 3 energy; to a battlefield P1 already controls → READY, and Pridestalker triggers just the same", async () => {
      const game = await handBoard(P1).build();
      expect(game.p1.can("play", "shadow")).toBe(true);
      await game.p1.play("shadow", { to: "bf1" });
      expect(game.p1.energy()).toBe(0);
      expect(game.zoneOf("shadow")).toBe("battlefield-bf1");
      expect(game.state("shadow").isReady).toBe(true);
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ps", controller: P1, triggered: true })]);
      expect(isPsPick(game)).toBe(true);
      await game.p1.pick("shadow");
      await game.settle();
      expect(game.state("shadow").might).toBe(4);
    });

    test("from hand to BASE → exhausted (same replacement, different destination); 2 energy is not enough at all", async () => {
      const game = await handBoard(P1).build();
      await game.p1.play("shadow", { to: "base" });
      expect(game.zoneOf("shadow")).toBe("base");
      expect(game.state("shadow").isExhausted).toBe(true);
      const poor = await handBoard(P1).resources(P1, { energy: 2 }).build();
      expect(poor.p1.can("play", "shadow")).toBe(false);
    });

    test("from hand with NO controlled battlefield, base is the only destination offered — the ready clause can never apply", async () => {
      const game = await scenario().legend(P1, PRIDESTALKER, "ps").resources(P1, { energy: 3 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "theirs").hand(P1, SHADOW, "shadow").build();
      const to = game.p1.option("play", "shadow")?.fields.find((f) => f.arg === "to");
      const offered = (to?.options ?? ["base"]) as string[];
      expect(offered.every((o) => o === "base")).toBe(true);
      await game.p1.play("shadow");
      expect(game.zoneOf("shadow")).toBe("base");
      expect(game.state("shadow").isExhausted).toBe(true);
    });
  });
});
