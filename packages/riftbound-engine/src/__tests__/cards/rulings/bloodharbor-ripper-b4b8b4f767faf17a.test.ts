/**
 * Ruling b4b8b4f767faf17a — Bloodharbor Ripper (Pyke legend, UNL-185 → unl-185-219)
 *     "[1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token exhausted."
 *   × Pyke, Dockside Butcher (unl-028-219) · Unit · Fury · 3 · [Hidden] [Ganking] … — "the hidden Pyke"
 *   × Bone Skewer (UNL-139 → unl-139-219) · Spell · Chaos · 2+[chaos] · Action · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to that
 *      battlefield, ignoring any and all costs. When they do, Stun it."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7 · 7 Might — the unit dragged down.
 *
 * Q: I hide a Pyke, then play Bone Skewer to drag down a Thousand-Tailed Watcher. Can I play ("activate") my hidden
 *    Pyke in response?
 * A: No. A card cannot be played from facedown on the turn it was hidden — not even in the Reaction window your own
 *    Bone Skewer opens. You must wait until a later turn.
 * Rules: 811.1.c (a hidden card may be played starting on the NEXT turn), 811.1.b (played for [0]), 336–343 (closed
 *        state / Reaction window).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOODHARBOR_RIPPER = "unl-185-219";
const PYKE_DOCKSIDE_BUTCHER = "unl-028-219";
const BONE_SKEWER = "unl-139-219";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";

/**
 * P1's turn (Pyke legend). P1 holds bf1 with a Holder; P2 holds bf2. P1: Pyke + Bone Skewer in hand and exactly
 * [rainbow] (to hide) + 2+[chaos] (Bone Skewer) + 1 spare. P2's hand: Thousand-Tailed Watcher.
 */
function board() {
  return scenario()
    .legend(P1, BLOODHARBOR_RIPPER, "ripper")
    .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, PYKE_DOCKSIDE_BUTCHER, "pyke")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, THOUSAND_TAILED_WATCHER, "watcher");
}

async function hidePykeThenSkewer(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("pyke", "bf1");
  expect(game.zoneOf("pyke")).toBe("facedown-bf1");
  expect(game.p1.energy()).toBe(3);
  expect(game.p1.power()).toBe(1); // hid for one power ([rainbow])
  await game.p1.cast("skewer", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0, rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "skewer", controller: P1, targets: ["bf1"] })]);
  return game;
}

/** Resolve Bone Skewer: P1 picks the revealed Watcher; P2 plays it to bf1 (answering its own play prompt); drain to an open state. */
async function resolveSkewerDraggingWatcher(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["watcher"]); // P2's revealed hand: the Watcher
      await game.p1.pick("watcher");
    } else if (d.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
}

describe("Ruling b4b8b4f767faf17a — a Pyke hidden this turn cannot be flipped in response to your own Bone Skewer", () => {
  test("with Bone Skewer on the chain and P1 holding priority, revealing the just-hidden Pyke is NOT legal (only pass/concede)", async () => {
    const game = await hidePykeThenSkewer();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "pyke")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    const r = await game.p1.try((p) => p.reveal("pyke"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("pyke")).toBe("facedown-bf1");
    // P2's Reaction window on the same chain: P1 still cannot sneak it in afterwards either.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("Bone Skewer resolves (Watcher is played to bf1 by P2, stunned); for the rest of THIS turn the hidden Pyke stays unplayable in every window P1 gets", async () => {
    const game = await hidePykeThenSkewer();
    let pykeEverLegal = false;
    for (let i = 0; i < 24; i++) {
      if (game.p1.can("reveal", "pyke")) {
        pykeEverLegal = true;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "watcher")?.key ?? (d.options[0]?.key as string));
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).yes();
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else if (d.kind === "distribute" || d.kind === "order") {
        await game.settle({ maxSteps: 1 });
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("skewer")).toBe("trash");
    expect(game.zoneOf("watcher")).not.toBe("hand"); // it was played out of P2's hand
    expect(game.p1.can("reveal", "pyke")).toBe(false);
    expect(pykeEverLegal).toBe(false);
    expect(game.zoneOf("pyke")).toBe("facedown-bf1");
  });

  test("on P1's NEXT turn the hidden Pyke is playable from facedown (for [0])", async () => {
    const game = await hidePykeThenSkewer();
    await resolveSkewerDraggingWatcher(game);
    await game.settle();
    expect(game.p1.can("reveal", "pyke")).toBe(false); // still the turn it was hidden
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.turnPlayer()).toBe(P1);
    // (The stunned Watcher's "attack" on bf1 dealt no damage and it was sent home; P1 still holds bf1 with the Pyke under it.)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("pyke")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "pyke")).toBe(true);
    const energyBefore = game.p1.energy();
    await game.p1.reveal("pyke");
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(energyBefore); // played from hidden ignoring its [3]
    expect(game.violations()).toEqual([]);
  });
});
