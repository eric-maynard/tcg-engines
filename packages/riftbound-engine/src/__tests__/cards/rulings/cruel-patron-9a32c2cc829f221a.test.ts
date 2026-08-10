/**
 * Ruling 9a32c2cc829f221a — rule 187.4.c ("Open state") walkthrough, anchored on Cruel Patron (OGN-208 → ogn-208-298, [4] 6 Might
 *     "As an additional cost to play me, kill a friendly unit.")
 *   × Baited Hook (OGN-242 → ogn-242-298, Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … banish a unit … and play it")
 *   × Arcane Shift (SFD-200 → sfd-200-221, [3][rainbow] "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 …")
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298, [7][mind] 7 Might)   × Glasc Mixologist (SFD-165 → sfd-165-221, Deathknell: play a
 *     ≤[3]/≤[rainbow] unit from trash)
 *
 * Q: What is this "Open state" wording in 187.4.c?
 * A: You only lose control of an emptied battlefield at a Cleanup while the turn is OPEN (nothing on the chain, no showdown there). So an
 *    effect that kills/banishes your lone unit at a battlefield while something is still on the chain — Cruel Patron's kill-cost, Baited
 *    Hook's kill-then-play, Arcane Shift's banish-then-play, Glasc Mixologist's Deathknell — leaves you in control, and the resulting unit
 *    may be played to that very battlefield.
 * Rules: 187.4.c, 323.6 (Cleanup vacancy check needs an Open state), 354.3, 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const BAITED_HOOK = "ogn-242-298";
const ARCANE_SHIFT = "sfd-200-221";
const WATCHER = "ogn-116-298";
const GLASC = "sfd-165-221";
const FALLING_COMET = "ogn-085-298"; // [5] Action "Deal 6 to a unit at a battlefield."
const SKULKER = "ogn-175-298"; // [3] 3-Might vanilla

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

async function passChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 9a32c2cc829f221a — 187.4.c: an emptied battlefield is only lost in an OPEN state", () => {
  test("contrast (Open state): when a lone unit simply walks off a battlefield with nothing on the chain, control IS lost at the next Cleanup", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "bf1", { might: 1, name: "Recruit" }, "recruit")
      .build();
    await game.p1.move("recruit", "base");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("Cruel Patron: killing my lone 1-Might Recruit at bf1 to pay the additional cost does not cost me bf1 (Patron is on the chain during that Cleanup) — bf1 is a legal destination and Patron lands there, bf1 still mine", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "bf1", { might: 1, name: "Recruit" }, "recruit")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    const fields = game.p1.option("play", "patron")?.fields ?? [];
    expect(fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["recruit"]);
    expect(fields.find((f) => f.arg === "to")?.options).toContain("battlefield-bf1");
    await game.p1.play("patron", { sacrifice: "recruit", to: "bf1" });
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("Baited Hook: kills my lone 4-Might Bait at bf1, I banish a 3-Might unit off the top 5 and play it — while it is pending bf1 cannot be lost, so bf1 is offered and the unit is played there", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 1, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "bf1", { might: 4, name: "Bait" }, "bait")
      .gear(P1, BAITED_HOOK, "hook")
      .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["s1", "s2", "s3", "s4", "s5", "s6"])
      .build();
    await game.p1.activate("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    let sawBf1 = false;
    for (let i = 0; i < 14; i++) {
      await passChain(game);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && pickKeys(d).includes("bait")) {
        await game.p1.pick("bait");
      } else if (d.kind === "pick" && d.seat === P1 && pickKeys(d).includes("s1")) {
        expect(game.zoneOf("bait")).toBe("trash"); // the kill already happened …
        expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // … and bf1 is still mine
        await game.p1.pick("s1");
      } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1")) {
        sawBf1 = true;
        expect(d.options.map((o) => o.key).toSorted()).toEqual(["base", "battlefield-bf1"]);
        await game.p1.pick("battlefield-bf1");
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else {
        const r = await game.settle({ maxSteps: 1, policy: "first" }); // deck-arrange / recycle bookkeeping
        if (r.reason === "unanswered") {
          break;
        }
      }
    }
    expect(sawBf1).toBe(true);
    await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Arcane Shift on my lone Thousand-Tailed Watcher at bf1: it is banished and re-played while the spell / the pending play keep the state Closed — bf1 is offered, the Watcher returns there, bf1 never changes hands", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "bf1", WATCHER, "watcher")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["watcher", "wall"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    let sawBf1 = false;
    for (let i = 0; i < 14; i++) {
      await passChain(game);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        sawBf1 = true;
        expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
        expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Watcher is off the board right now, yet bf1 is still P1's
        expect(game.zoneOf("watcher")).not.toBe("battlefield-bf1");
        await game.p1.pick("battlefield-bf1");
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no(); // decline Accelerate if offered
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        const r = await game.settle({ maxSteps: 1 });
        if (r.reason === "unanswered") {
          break;
        }
      }
    }
    expect(sawBf1).toBe(true);
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0); // re-played ignoring its cost
  });

  test("Glasc Mixologist dying ALONE at my bf1 outside combat (Falling Comet on P2's turn): its Deathknell is on the chain, so bf1 stays mine and the Skulker from my trash may be played straight to bf1", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "bf1", GLASC, "glasc")
      .trash(P1, SKULKER, "skulker")
      .hand(P2, FALLING_COMET, "comet")
      .build();
    await game.p2.cast("comet", { targets: "glasc" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Closed state: not lost
    let sawBf1 = false;
    for (let i = 0; i < 12; i++) {
      await passChain(game);
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      expect(d.seat).toBe(P1);
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick" && pickKeys(d).includes("skulker")) {
        await game.p1.pick("skulker");
      } else if (d.kind === "pick" && d.options.some((o) => o.key === "battlefield-bf1")) {
        sawBf1 = true;
        await game.p1.pick("battlefield-bf1");
      } else {
        break;
      }
    }
    expect(sawBf1).toBe(true);
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
