/**
 * Ruling e3a3408054d5f903 — Hextech Ray (OGN-009 → ogn-009-298) · Spell · Fury · 1+[fury] · Action — "Deal 3 to a unit at a battlefield."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action — "Move a friendly unit and ready it."
 *
 * Q: I play Hextech Ray during a showdown; my opponent wants to Ride the Wind the unit away — does my damage resolve first?
 * A: Yes. With Hextech Ray on the chain the opponent may only respond with Reactions; Ride the Wind is an Action, so it
 *    cannot be played in response. Hextech Ray resolves (the unit dies if the damage is lethal), the chain closes, and only
 *    then — with Focus — may the opponent play Ride the Wind (if the unit survived).
 * Rules: 331/332 (only Reactions while a chain exists), 345–347 (Focus in a showdown allows Actions on an empty chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with Foe (`foeMight`); P1's Raider (5) attacks from base; P1 has Hextech Ray + [1][fury]; P2 has Ride the Wind + [2][chaos]. */
function board(foeMight: number) {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, RIDE_THE_WIND, "ride");
}

/** Raider attacks bf1 (combat showdown, P1 has Focus) and P1 immediately plays Hextech Ray on Foe. */
async function rayOnTheChain(foeMight: number): Promise<Game> {
  const game = await board(foeMight).build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "ray")).toBe(true);
  await game.p1.cast("ray", { targets: "foe" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1 })]);
  return game;
}

describe("Ruling e3a3408054d5f903 — an Action (Ride the Wind) cannot answer Hextech Ray; it waits for the chain to close", () => {
  test("with Hextech Ray on the chain P2 does get priority — but Ride the Wind (Action) is NOT a legal play there; P2 can only pass", async () => {
    const game = await rayOnTheChain(3);
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(false);
    expect((await game.p2.try((p) => p.cast("ride", { targets: "foe" }))).ok).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).filter((v) => v !== "concede")).toEqual(["passPriority"]);
  });

  test("Foe at 3 Might: Hextech Ray resolves, Foe dies, the chain closes — Ride the Wind can no longer save it (Foe is in the trash; the only thing left to Ride is the Anchor)", async () => {
    const game = await rayOnTheChain(3);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    // Focus comes round to P2 on an empty chain: NOW an Action is legal — but not on the dead Foe.
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    const targets = game.p2.option("cast", "ride")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets).not.toContain("foe");
    expect((await game.p2.try((p) => p.cast("ride", { targets: "foe" }))).ok).toBe(false);
  });

  test("Foe at 4 Might survives the 3: after the chain closes P2, holding Focus on an empty chain, MAY now play Ride the Wind on Foe and move it out", async () => {
    const game = await rayOnTheChain(4);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("foe")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    await game.p2.cast("ride", { targets: "foe" });
    for (let i = 0; i < 8 && game.zoneOf("ride") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        const want = d.options.find((o) => o.key === "battlefield-bf2" || o.key === "bf2" || o.key === "base") ?? d.options[0];
        await game.p2.pick(want!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      const d = game.decision()!;
      const want = d.kind === "pick" ? (d.options.find((o) => o.key === "battlefield-bf2" || o.key === "bf2" || o.key === "base") ?? d.options[0]) : undefined;
      await game.p2.pick(want!.key);
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("foe")).not.toBe("bf1");
    expect(game.state("foe").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
