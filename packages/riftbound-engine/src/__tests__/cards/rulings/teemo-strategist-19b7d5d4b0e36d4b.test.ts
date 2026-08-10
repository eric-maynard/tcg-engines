/**
 * Ruling 19b7d5d4b0e36d4b — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion · Mind · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that
 *      unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · "As you look at or reveal me from the top of your deck, you may
 *     banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Can Teemo's ability be used from Hidden when there are no (enemy) units at the battlefield — e.g. to dig for Nocturne?
 * A: No. The ability must declare a valid enemy unit here as it would go on the chain; with none, it never enters the
 *    chain, so nothing is revealed or recycled. Nocturne can be found off Teemo only when the ability DOES enter the
 *    chain (an enemy unit is here); then, if Nocturne is among the revealed cards, you may banish and play him.
 * Rules: 811 (playing from Hidden), 355.5 / 383 (a triggered ability that must choose and can't is removed — never a
 *        chain item), 424 / 403 (reveal, recycle), Nocturne's reveal replacement.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const NOCTURNE = "ogn-194-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] spell
const SKULKER = "ogn-175-298";

const TOP_SIX = ["noc", "h1", "n1", "n2", "n3", "n4"];

/**
 * Turn 3. P1 holds bf1 with Holder (4) and hid Teemo there earlier; P1's deck top→: Nocturne, Back Off (H), 4 Skulkers;
 * P1 has one [rainbow] (Nocturne's "play me for [rainbow]"). P2's Raider (5) waits in base.
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .deck(P1, [NOCTURNE, BACK_OFF, SKULKER, SKULKER, SKULKER, SKULKER], TOP_SIX);
}

function isNocturneOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`) || d.source?.cardId === "noc";
  }
  if (d.kind === "pick") {
    return d.source?.cardId === "noc" || (/banish|nocturne/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc"));
  }
  return false;
}

/** P2's Raider attacks bf1, P2 passes focus, P1 plays Teemo from face-down into the fight. */
async function revealIntoAttack(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.reveal("teemo");
  return game;
}

describe("Ruling 19b7d5d4b0e36d4b — Teemo's ability needs an enemy unit here to reach the chain; only then can it dig up Nocturne", () => {
  test("NO enemy unit at bf1 (P1's own quiet turn): P1 may still play Teemo from Hidden, but no ability is put on the chain — nothing is revealed, nothing recycled, Nocturne stays on top, no prompt of any kind", async () => {
    const game = await board(P1).build();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("WITH an enemy unit here (Raider attacking bf1): playing Teemo from Hidden makes him a defender and the ability DOES enter the chain, naming the Raider", async () => {
    const game = await revealIntoAttack();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raider"], triggered: true })]);
  });

  test("…and on resolution the top 5 ARE revealed and recycled: one [Hidden] card (Back Off) → Raider takes 1; n4 becomes the top card", async () => {
    const game = await revealIntoAttack();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Decline anything optional (a Nocturne offer, if made) to observe the bare reveal.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "pick" && d.allowDecline) {
        await game.seat(d.seat).decline();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(1);
    expect(game.p1.deck()[0]).toBe("n4");
    expect(game.p1.deck().indexOf("noc")).toBeGreaterThan(0); // no longer on top (recycled)
  });

  // Expected (ruling): as the trigger reveals the top 5, Nocturne's "as you reveal me" lets P1 banish him and then play
  // him for [rainbow] — a P1 prompt sourced from Nocturne appears during the resolution; accepting spends the rainbow and
  // puts Nocturne on the board. Actual: the five cards are revealed/recycled with no Nocturne offer at all.
  test("ruling 19b7d5d4b0e36d4b — Teemo's reveal surfaces no Nocturne banish/play offer; ruling: when the ability enters the chain and reveals Nocturne, P1 may banish and play him for [rainbow]", async () => {
    const game = await revealIntoAttack();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(isNocturneOffer(d)).toBe(true);
    if (d!.kind === "yes-no") {
      await game.p1.yes();
    } else {
      await game.p1.pick("noc");
    }
    for (let i = 0; i < 6; i++) {
      const n = game.decision();
      if (!n || n.seat !== P1 || n.kind === "action") {
        break;
      }
      if (n.kind === "yes-no") {
        await game.p1.yes();
      } else if (n.kind === "pick") {
        await game.p1.pick(n.options[0]!.key);
      } else {
        break;
      }
    }
    await game.settle({ maxSteps: 20 });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("noc"));
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.deck()).not.toContain("noc");
  });
});
