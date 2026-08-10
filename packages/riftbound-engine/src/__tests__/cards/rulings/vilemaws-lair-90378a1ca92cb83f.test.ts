/**
 * Ruling 90378a1ca92cb83f — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield "Units can't move from here to base."
 *   × Charm (ogn-043-298, [1][calm] "Move an enemy unit."), Fight or Flight (ogn-168-298, [2] "Move a unit from a battlefield to its
 *     base."), Tideturner (ogn-199-298, "…Move me to its location and it to my original location."), Flash (ogs-011-024, Reaction [2]
 *     "Move up to 2 friendly units to base.")   (Vilemaw unl-060-219 is listed but plays no part.)
 *
 * Q: Does the Lair stop only the standard move action, or ALL movement to base?
 * A: All of it, card effects included. Charm / Fight or Flight / Tideturner / Flash may still legally choose a unit at the Lair,
 *    but the move-to-base part resolves with no effect ("can't" beats "can").
 * Rules: 105 (can't > can), 446 (Move), 359.3.e.6 (an impossible instruction is skipped; the rest still resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const CHARM = "ogn-043-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const TIDETURNER = "ogn-199-298";
const FLASH = "ogs-011-024";

/** P1's Spider (3) at the LIVE Lair (P1's); a second, ordinary battlefield bf2 exists. */
function lair() {
  return scenario()
    .turn(3)
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "lair", { might: 3, name: "Spider" }, "spider");
}

describe("Ruling 90378a1ca92cb83f — Vilemaw's Lair blocks ALL movement to base, not just the standard move", () => {
  test("standard move: the Spider at the Lair is simply not offered a move to base", async () => {
    const game = await lair().build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    const field = game.p1.option("standardMove:to:base")?.fields.find((f) => f.name === "unitIds");
    const offered = (field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
    expect(offered).not.toContain("spider");
  });

  test("Fight or Flight: the Spider is a LEGAL choice and the spell is paid for and resolves — but the Spider stays at the Lair", async () => {
    const game = await lair().resources(P1, { energy: 2 }).hand(P1, FIGHT_OR_FLIGHT, "fof").build();
    const field = game.p1.option("cast", "fof")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[])).toContain("spider");
    await game.p1.cast("fof", { targets: "spider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Flash (Reaction, 'to base'): legal on the Spider, resolves, Spider does not budge", async () => {
    const game = await lair().resources(P1, { energy: 2 }).hand(P1, FLASH, "flash").build();
    await game.p1.cast("flash", { targets: "spider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
  });

  test("Charm (opponent's 'Move an enemy unit'): P2 may target the Spider and pick base as the destination — the Spider stays; picking bf2 instead really moves it", async () => {
    const mk = () => lair().active(P2).resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, CHARM, "charm").build();
    const toBase = await mk();
    await toBase.p2.cast("charm", { targets: "spider" });
    expect(toBase.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const r = await toBase.settle();
    const d = toBase.decision();
    if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P2) {
      expect(d.semantics).toBe("destination");
      const baseOpt = d.options.find((o) => o.key === "base");
      await toBase.p2.pick(baseOpt ? "base" : (d.options.find((o) => o.key !== "battlefield-bf2")?.key ?? d.options[0]!.key));
      await toBase.settle();
    }
    expect(toBase.zoneOf("charm")).toBe("trash");
    expect(toBase.zoneOf("spider")).toBe("battlefield-lair");

    const toBf = await mk();
    await toBf.p2.cast("charm", { targets: "spider" });
    await toBf.settle();
    const d2 = toBf.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2 });
    if (d2?.kind === "pick") {
      expect(d2.options.map((o) => o.key)).toContain("battlefield-bf2");
    }
    await toBf.p2.pick("battlefield-bf2");
    await toBf.settle();
    expect(toBf.locationOf("spider")).toBe("bf2"); // battlefield → battlefield is not restricted
  });

  test("Tideturner played to base choosing the Lair Spider: Tideturner's half of the swap happens (it goes to the Lair) but the Spider is NOT moved to base", async () => {
    const game = await lair().resources(P1, { energy: 2 }).hand(P1, TIDETURNER, "tide").build();
    await game.p1.play("tide", { to: "base" });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("spider"); // a legal choice
        await game.p1.pick("spider");
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
    expect(game.zoneOf("tide")).toBe("battlefield-lair");
    expect(game.violations()).toEqual([]);
  });
});
