/**
 * Ruling 962925d978373548 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] calm · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can Zhonya's be played HIDDEN at base to save a unit at a battlefield, or must it be at the same battlefield?
 * A: You cannot hide cards at base — hiding is only at a battlefield you control. Played face up it goes to your BASE (gear is
 *    never at a battlefield), and from base it saves your next unit to die ANYWHERE on the board. If you hide it at a
 *    battlefield and later play it from hidden, it is likewise played to base, not to that battlefield.
 * Rules: 811.1.a (Hide = place facedown at a battlefield you control), 149.1/149.2 (gear is played to base), 811.1.c.3
 *        (playing from facedown), 366–371 (the replacement watches any friendly unit, wherever it is).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

describe("Ruling 962925d978373548 — no hiding at base; Zhonya's lives in base and saves a unit dying anywhere", () => {
  test("cannot hide at base: with a [rainbow] to pay, the only Hide destination is the controlled battlefield bf1 — 'base' (and the enemy bf2) are refused", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect(game.p1.can("hide", "zh")).toBe(true);
    const dests = (game.p1.option("hide", "zh")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(dests.map((d) => d.replace(/^(battlefield-|facedown-)/, ""))).toEqual(["bf1"]);
    expect((await game.p1.try((p) => p.hide("zh", "base"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.hide("zh", "bf2"))).ok).toBe(false);
    expect(game.zoneOf("zh")).toBe("hand");
  });

  test("played face up it goes to BASE (never to a battlefield) — and from base it saves a friendly unit that dies at a BATTLEFIELD: Zhonya's is killed instead, the unit is healed, exhausted and recalled", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .gear(P1, ZHONYAS, "zh")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    expect(game.state("zh")).toMatchObject({ location: "base", zone: "base" });
    const playDests = (game.p1.option("play", "zh")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(playDests.filter((d) => d !== "base")).toEqual([]); // (not P1's turn anyway; no battlefield destination exists for gear)
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("'anywhere': the base-dwelling Zhonya's equally saves a unit dying at a DIFFERENT battlefield (bf2) than any it could have been hidden at", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "bf2", { might: 2, name: "Far Scout" }, "far")
      .gear(P1, ZHONYAS, "zh")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf2");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("far")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("nuance: hidden at bf1 and later played from facedown, the Hourglass is played to BASE (not to bf1) — and then saves a unit dying at bf2", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "bf2", { might: 2, name: "Far Scout" }, "far")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf2"); // attack at bf2; P2 has Focus first
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "zh")).toBe(true); // a hidden card may be played as a Reaction from ANY battlefield's facedown slot
    await game.p1.reveal("zh");
    expect(game.state("zh")).toMatchObject({ isHidden: false, location: "base", zone: "base" }); // to base, not bf1
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // it replaced Far Scout's death at bf2
    expect(game.state("far")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
