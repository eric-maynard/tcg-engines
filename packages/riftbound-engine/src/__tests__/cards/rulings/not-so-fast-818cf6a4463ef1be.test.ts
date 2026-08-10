/**
 * Ruling 818cf6a4463ef1be — Not So Fast (SFD-045 → sfd-045-221) · Reaction · 2 + [calm] · "Counter an enemy spell or ability that
 *   chooses a friendly unit or gear."   × Riposte (SFD-206 → sfd-206-221) · Reaction · 2 · "Choose a friendly unit and a spell.
 *   Counter that spell and give that unit +[Might] equal to that spell's Energy cost this turn."
 *
 * Q: Can I Not So Fast an opposing Riposte?
 * A: No. "Friendly" is relative to each spell's controller: Riposte chooses a unit friendly to ITS caster — an enemy unit from my
 *    side — so it is not "an enemy spell that chooses a friendly unit" for my Not So Fast.
 * Rules: 355.9.b (friendly/enemy are relative to the controller), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const RIPOSTE = "sfd-206-221";
const HEXTECH_RAY = "ogn-009-298"; // P1's spell for Riposte to counter (Energy cost 1)

/** P1's turn 3. P2 holds bf1 with a 2-Might Duelist and has Riposte (2 + [body][order]). P1: Ray (1+[fury]) + Not So Fast (2+[calm]). */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { calm: 1, fury: 1 } })
    .resources(P2, { energy: 2, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Duelist" }, "duelist")
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P2, RIPOSTE, "riposte");
}

function nsfOffered(game: Game): string[] {
  const opt = game.p1.option("cast", "nsf");
  return (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
}

/** P1 Rays the Duelist; P2 answers with Riposte (Duelist + the Ray); priority back to P1. */
async function riposteOnTheChain(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "duelist" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "riposte")).toBe(true);
  await game.p2.cast("riposte", { targets: "duelist" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    await game.p2.pick("ray"); // "… and a spell" — the Ray, if the engine asks (it is the only spell)
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "riposte"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2 });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 818cf6a4463ef1be — Not So Fast cannot counter an opposing Riposte", () => {
  test("Riposte (enemy spell) chooses P2's OWN Duelist — an enemy unit to P1 — so Not So Fast is never offered it: not castable, attempt refused, P1's 2+[calm] untouched", async () => {
    const game = await board().build();
    await riposteOnTheChain(game);
    expect(nsfOffered(game)).not.toContain("riposte");
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "riposte" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "riposte"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 0 } });
  });

  test("so Riposte resolves: the Ray is countered (Duelist unhurt) and the Duelist gets +1 Might (the Ray's Energy cost) this turn", async () => {
    const game = await board().build();
    await riposteOnTheChain(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("duelist")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
