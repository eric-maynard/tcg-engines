/**
 * Ruling 6a4bc4243c4e2ba6 — Challenge (OGN-128 → ogn-128-298) · Action · [2][body] "Choose a friendly unit and an enemy unit. They deal damage equal
 *     to their Mights to each other."
 *   × Shakedown (OGN-033 → ogn-033-298) · Reaction · [2][fury] "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Q: Challenge targets my 5-Might unit and their 4-Might unit; they respond with Shakedown and kill my unit. What happens when Challenge resolves?
 * A: Shakedown resolves first and my unit dies. Challenge then can't find my unit — it can neither deal damage nor have its Might read — so
 *    nothing happens; the enemy unit takes no damage. I may NOT substitute another unit: targets are declared when the spell goes on the chain.
 * Rules: 340 (LIFO), 355.4 (targets fixed at play time), 359.3.e.5–7 (an illegal/missing target's instructions are skipped), 417.6.b.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const SHAKEDOWN = "ogn-033-298";

/**
 * P1's turn. P1: Champion (5) and a Bystander (3) in base, Challenge with [2][body]. P2: Target (4) at P2's bf1, Shakedown with [2][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Champion" }, "champ")
    .unit(P1, "base", { might: 3, name: "Bystander" }, "bystander")
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, SHAKEDOWN, "shakedown");
}

/** Challenge [champ, target]; P1 passes; P2 Shakedowns the Champion; both pass; P1 (its controller) refuses to hand over cards → it takes 6. */
async function challengeThenShakedown(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("challenge", { targets: ["champ", "target"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", targets: ["champ", "target"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "shakedown")).toBe(true);
  await game.p2.cast("shakedown", { targets: "champ" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "shakedown"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Shakedown resolves first (LIFO)
  const d = game.decision();
  expect(d?.seat).toBe(P1); // the Champion's controller decides the "unless"
  if (d?.kind === "yes-no") {
    await game.p1.no();
  } else if (d?.kind === "pick") {
    const deal = d.options.find((o) => !/draw/i.test(o.label)) ?? d.options[1];
    await game.p1.pick(deal?.key as string);
  }
  expect(game.zoneOf("shakedown")).toBe("trash");
  return game;
}

describe("Ruling 6a4bc4243c4e2ba6 — Shakedown kills Challenge's friendly target in response: Challenge resolves doing nothing", () => {
  test("Shakedown resolves first: the Champion takes 6 ≥ 5 and dies while Challenge is still waiting on the chain", async () => {
    const game = await challengeThenShakedown();
    expect(game.zoneOf("champ")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.state("target").damage).toBe(0);
    expect(game.p2.hand()).toEqual([]); // P1 did not have P2 draw
  });

  test("Challenge then resolves and finds no friendly unit: NO damage either way — the Target is untouched (0 damage, alive) — and P1 is never asked to name a replacement unit (the Bystander is not dragged in)", async () => {
    const game = await challengeThenShakedown();
    let substitutePrompt = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "bystander")) {
        substitutePrompt = true;
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(substitutePrompt).toBe(false);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("bystander")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // Challenge's cost stays paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response Challenge trades blows — Target (4) takes 5 and dies, Champion takes 4 < 5 and lives", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["champ", "target"] });
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.state("champ")).toMatchObject({ damage: 4, zone: "base" });
  });
});
