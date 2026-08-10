/**
 * Ruling ece53049c4eb5da1 — Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might · "When I defend, you may kill me to move an attacking
 *     unit to its base."
 *   × Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · 4 Might · "[Ambush] When I attack or defend, if an enemy unit is alone here,
 *     give me +2 [Might] this turn and gain 2 XP."
 *
 * Q: In reaction to Overzealous Fan dying (to its own ability), can I Ambush Kha'Zix in and get his +2?
 * A: Yes. Fan's defend trigger is opted into and its cost (kill Fan) paid as it goes on the chain; with that item pending you may
 *    play Kha'Zix as a Reaction (Ambush). He enters, gains Defender, and — the lone attacker being alone — his trigger goes on the
 *    chain ABOVE Fan's ability and resolves first: +2 Might and 2 XP. Then Fan's ability resolves.
 * Rules: 383.3.b / 204.3.a (optional cost paid at finalization), 813 (Reaction window on a pending item), Ambush, 464.2.c.3.a
 *        (late defender designation), 383.2 (condition checked when triggered), 336.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const KHAZIX = "unl-143-219";

/** P2's turn 3. P1 holds bf1 with Overzealous Fan (2) + Anchor (2); Kha'Zix in hand with exactly [4][chaos]; 0 XP. P2: Rengar (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Rengar" }, "rengar")
    .hand(P1, KHAZIX, "khazix");
}

const isFanOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));

/** Rengar attacks bf1 alone; P1 accepts the Fan's "you may kill me" (naming Rengar if asked). Stops with the Fan item pending. */
async function fanKillsItself(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("rengar", "bf1");
  expect(game.state("rengar").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  let offered = false;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (isFanOffer(d)) {
      offered = true;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "rengar")?.key ?? (d.options[0]?.key as string));
    } else {
      break;
    }
  }
  expect(offered).toBe(true);
  return game;
}

/** P1 Ambushes Kha'Zix into bf1 while the Fan item is pending (taking priority first if P2 holds it). */
async function ambushKhazix(game: Game): Promise<void> {
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("play", "khazix")).toBe(true);
  await game.p1.play("khazix", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
}

describe("Ruling ece53049c4eb5da1 — Ambush Kha'Zix in response to Overzealous Fan's self-kill: he gets +2 / 2 XP first", () => {
  test("step 1: accepting the Fan's trigger pays its cost NOW — the Fan is already dead (trash) while its 'move an attacking unit to base' item waits on the chain; Rengar hasn't moved", async () => {
    const game = await fanKillsItself();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, triggered: true })]);
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a Reaction window exists
  });

  test("steps 2–5: in that window P1 may Ambush Kha'Zix to bf1 (P1 still has the Anchor there); he enters as a DEFENDER and, Rengar being the lone enemy here, his trigger lands ABOVE the Fan's item", async () => {
    const game = await fanKillsItself();
    await ambushKhazix(game);
    expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
    expect(game.state("khazix").combatRole).toBe("defender");
    expect(game.p2.units("bf1")).toEqual(["rengar"]); // the enemy unit is alone here
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "khazix"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("khazix").might).toBe(4); // not yet resolved
  });

  test("step 6 (LIFO): Kha'Zix's trigger resolves first → 6 Might and P1 gains 2 XP, with the Fan's item still pending; then the Fan's ability sends Rengar to base and the combat ends with bf1 still P1's", async () => {
    const game = await fanKillsItself();
    await ambushKhazix(game);
    expect(game.p1.xp()).toBe(0);
    // Resolve only the top item.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "khazix"); i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
    expect(game.locationOf("rengar")).toBe("bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("rengar")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("khazix")).toMatchObject({ might: 6, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
