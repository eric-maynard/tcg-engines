/**
 * Ruling a099691b34a300de — LeBlanc, Fragmented (UNL-172 → unl-172-219) · 3 Might · [Assault] · Deathknell
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Legend used for "my legend trigger": Deceiver (unl-199-219, LeBlanc's legend) "When you conquer or hold, you may discard 1
 *   and exhaust me to play a ready Reflection unit token there. …"
 *
 * Q: LeBlanc attacks (4 Might with Assault) and conquers; while my legend's conquer trigger is on the chain, is she still 4 and
 *    can the opponent Gust her?
 * A: She is still 4 — Assault lasts until the combat showdown ends, which includes the conquer trigger window — so Gust
 *    ("3 or less") cannot target her.
 * Rules: 807.1.c (Assault while an attacker), 466.7 (designations last until combat ends), 383.3.b, 336 (closed state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC = "unl-172-219";
const DECEIVER = "unl-199-219";
const GUST = "ogn-169-298";
const FODDER = "ogn-175-298";

/** P1 (Deceiver) attacks P2's bf1 — held by a 2-Might [Assault] Blocker — with LeBlanc; P1 has a card to discard; P2 holds Gust with [1]. */
function board() {
  return scenario()
    .legend(P1, DECEIVER, "deceiver")
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { abilities: [{ keyword: "Assault", type: "keyword", value: 1 }], keywords: ["Assault"], might: 2, name: "Blocker" }, "blocker")
    .unit(P1, "base", LEBLANC, "leb")
    .hand(P1, FODDER, "fodder")
    .hand(P2, GUST, "gust");
}

/** LeBlanc attacks and wins; P1 accepts Deceiver's conquer trigger (discard + exhaust) and passes → P2 holds priority with the trigger pending. */
async function conquerTriggerPendingForP2(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("leb", "bf1");
  expect(game.state("leb")).toMatchObject({ combatRole: "attacker", might: 4 }); // 3 + Assault
  expect(game.state("blocker").might).toBe(2); // the DEFENDER's Assault does nothing
  await game.settle();
  expect(game.zoneOf("blocker")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "deceiver" } });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  expect(game.zoneOf("fodder")).toBe("trash");
  expect(game.state("deceiver").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "deceiver", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling a099691b34a300de — LeBlanc keeps Assault during the conquer trigger, so Gust cannot take her", () => {
  test("with the legend's conquer trigger on the chain LeBlanc is still an attacker at 4 Might", async () => {
    const game = await conquerTriggerPendingForP2();
    expect(game.state("leb")).toMatchObject({ combatRole: "attacker", location: "bf1", might: 4 });
  });

  test("P2 (with [1] for Gust) is NOT offered LeBlanc: Gust is illegal / she is not among its targets; forcing it fails and she stays", async () => {
    const game = await conquerTriggerPendingForP2();
    expect(game.p2.energy()).toBe(1);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("leb");
    expect(game.p2.can("cast", "gust")).toBe(false);
    const r = await game.p2.try((p) => p.cast("gust", { targets: "leb" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("leb")).toBe("battlefield-bf1");
    expect(game.zoneOf("gust")).toBe("hand");
  });

  test("after the trigger resolves and combat fully ends she is a plain 3 again at bf1 (Assault off) — the window the ruling describes has closed", async () => {
    const game = await conquerTriggerPendingForP2();
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.state("leb")).toMatchObject({ location: "bf1", might: 3 });
    expect(game.state("leb").combatRole).not.toBe("attacker");
    expect(game.violations()).toEqual([]);
  });
});
