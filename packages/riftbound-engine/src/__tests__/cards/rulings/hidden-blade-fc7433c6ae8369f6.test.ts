/**
 * Ruling fc7433c6ae8369f6 — Hidden Blade (OGN-213 → ogn-213-298) · Order [Hidden][Action] spell · [2][order]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear — "If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *   (+ Tideturner ogn-199-298 played from Hidden as the Reaction-speed "move the target to ANOTHER battlefield", and
 *      Flash ogs-011-024 [Reaction] "Move up to 2 friendly units to base" as the "return the target to base" answer.)
 *
 * Q: How does Hidden Blade behave when (1) Zhonya's/Sett replaces the death, (2) it was played from HIDDEN and the target
 *    moves to another battlefield, (3) it was played from HAND and the target moves to another battlefield, (4) the
 *    target is returned to base?
 * A: (1) unit saved by the replacement, its controller still draws 2. (2) no kill, no draw — from hidden the target
 *    must be "here" and no longer is. (3) killed and draw — "a unit at a battlefield" is still true. (4) no kill, no
 *    draw — a unit in base is not at a battlefield.
 * Rules: 811.1.d.2 (from Hidden: choices restricted to "here", re-checked on resolution), 359.3.e.4/.5 (target must
 *        still meet the requirement), 359.3.e.14 (linked "its controller draws"), 371–373 (die replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const TIDETURNER = "ogn-199-298";
const FLASH = "ogs-011-024";
const FILLER = "ogn-175-298";

/** Drain chain/trigger prompts: P2 accepts Tideturner's swap and names the Victim; everyone else passes. Stops at showdown/main. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 14; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick("victim");
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

describe("Ruling fc7433c6ae8369f6 (1) — Zhonya's Hourglass replaces the kill; the saved unit's controller still draws 2", () => {
  test("P1 Hidden Blades P2's Victim; P2's Hourglass dies instead, Victim is recalled to base exhausted and undamaged — and P2 draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .gear(P2, ZHONYAS, "hourglass")
      .hand(P1, HIDDEN_BLADE, "blade")
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling fc7433c6ae8369f6 (2) — played from HIDDEN, target swapped to another battlefield: no kill, no draw", () => {
  /**
   * Turn 3, P2's turn. P1 holds bf1 with Holder (5) and a facedown Hidden Blade there. P2 holds bf2 with Guard (4) and a
   * facedown Tideturner there; P2's Victim (3) attacks bf1 from base.
   */
  function board() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
      .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
      .facedown(P2, "bf2", TIDETURNER, "tide")
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
  }

  test("Victim attacks bf1; on Focus P1 flips Hidden Blade at it (a unit HERE); P2 answers by flipping Tideturner at bf2 and swapping — Victim ends at bf2, so the Blade resolves doing nothing: Victim lives, nobody draws", async () => {
    const game = await board().build();
    await game.p2.move("victim", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["victim"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("victim");
    }
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["blade", ["victim"]]]);
    expect(game.p1.energy()).toBe(0); // from hidden for [0]
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "tide")).toBe(true);
    await game.p2.reveal("tide");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 }); // Tideturner's optional swap
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("victim");
    }
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["blade", ["victim"]],
      ["tide", ["victim"]],
    ]);
    // LIFO: the swap resolves first.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    // Hidden Blade resolves: Victim is no longer "here" (bf1) → not killed, no draw, no re-target onto Tideturner.
    await drain(game);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling fc7433c6ae8369f6 (3) — played from HAND, target swapped to another battlefield: still killed, controller draws 2", () => {
  test("P1 casts Hidden Blade from hand at Victim (bf1); P2's hidden Tideturner swaps Victim to bf2 in response — 'a unit at a battlefield' still holds: Victim dies at bf2 and P2 draws 2", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
      .facedown(P2, "bf2", TIDETURNER, "tide")
      .hand(P1, HIDDEN_BLADE, "blade")
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "tide")).toBe(true);
    await game.p2.reveal("tide");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("victim");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tide"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // swap
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    await drain(game); // Hidden Blade
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1"); // not re-aimed
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling fc7433c6ae8369f6 (4) — target returned to BASE in response: not killed, no draw", () => {
  test("from hand: P2 Flashes the Victim home in response; Hidden Blade finds it in base (not at a battlefield) → nothing happens, nobody draws", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .hand(P1, HIDDEN_BLADE, "blade")
      .hand(P2, FLASH, "flash")
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await drain(game);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("from hidden: Victim attacks P1's bf1, P1 flips Hidden Blade at it, P2 Flashes it home → the Blade does nothing, no draw; the attack is over", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
      .hand(P2, FLASH, "flash")
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p2.move("victim", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("blade", { answers: ["victim"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("victim");
    }
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await drain(game);
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
