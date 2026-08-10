/**
 * Ruling effb9ccebafaa221 — Immortal Phoenix (OGN-037 → ogn-037-298) · [3][fury] · 3 Might
 *     "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Get Excited! (OGN-008 → ogn-008-298) · [Action] · 2+[fury] · "Discard 1. Deal its Energy cost as damage to a unit at a
 *     battlefield."
 *
 * Q: One Phoenix on the board, one in the trash, one in hand. I Get Excited!, discarding the Phoenix in hand and killing my
 *    own Phoenix on the board with the 3 damage. How many Phoenix triggers do I get?
 * A: All three. The discarded one is in the trash before the kill happens, and the killed one is in the trash by the time
 *    triggers are checked, so every Phoenix in the trash sees "you killed a unit with a spell".
 * Rules: 383.2.c.1 (the CR's Immortal Phoenix example — evaluated with the Phoenix already in the trash), 157.3.a, 415.1
 *        (play from trash), 359 (discard happens during resolution, before the damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const GET_EXCITED = "ogn-008-298";

/**
 * P1's turn: Phoenix A at P1's bf1 (with a Holder), Phoenix B in the trash, Phoenix C + Get Excited! in hand;
 * exactly 2+[fury] for the spell plus 3 × [1][fury] for three revivals.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 4 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "pA")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, IMMORTAL_PHOENIX, "pB")
    .hand(P1, IMMORTAL_PHOENIX, "pC")
    .hand(P1, GET_EXCITED, "ge");
}

/** Cast Get Excited! at Phoenix A, resolve it discarding Phoenix C (3 ⇒ 3 damage kills A). Stops at the first Phoenix opt-in. */
async function getExcitedKillsA(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ge", { targets: "pA" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // "Discard 1" — the only card in hand is Phoenix C.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("pC");
  await game.acceptTriggerOrder();
  return game;
}

/** Collect the Phoenix opt-ins in order, answering each with `answer`. */
async function answerPhoenixAsks(game: Game, answer: "yes" | "no"): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "yes-no" || d.seat !== P1) {
      break;
    }
    expect(d.prompt).toMatch(/\[1\]\[fury\]/);
    asked.push(String(d.source?.cardId));
    await (answer === "yes" ? game.p1.yes() : game.p1.no());
  }
  return asked;
}

describe("Ruling effb9ccebafaa221 — Get Excited! (discard a Phoenix, kill a Phoenix) wakes all THREE Phoenixes in the trash", () => {
  test("after the spell resolves all three Phoenixes are in the trash (C discarded first, A killed by the 3 damage, B already there) and THREE separate '[1][fury]?' opt-ins are asked — one per Phoenix", async () => {
    const game = await getExcitedKillsA();
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.zoneOf("pA")).toBe("trash");
    expect(game.zoneOf("pB")).toBe("trash");
    expect(game.zoneOf("pC")).toBe("trash");
    expect(game.state("holder").damage).toBe(0);
    const asked = await answerPhoenixAsks(game, "no");
    expect(asked.toSorted()).toEqual(["pA", "pB", "pC"]);
    // All declined: nothing paid, all stay in the trash.
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3 } });
    expect(game.p1.trash().toSorted()).toEqual(["ge", "pA", "pB", "pC"]);
  });

  test("paying all three (3 × [1][fury]): every Phoenix is played from the trash back onto P1's board", async () => {
    const game = await getExcitedKillsA();
    const asked = await answerPhoenixAsks(game, "yes");
    expect(asked).toHaveLength(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // Resolve the three items, taking base for any destination ask.
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
        await game.p1.pick(base ? base.key : (d.options[0]?.key as string));
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder(); // 383.3.d — same-controller triggers: keep the listed order
      } else {
        break;
      }
    }
    await game.settle();
    for (const id of ["pA", "pB", "pC"]) {
      expect(game.zoneOf(id)).not.toBe("trash");
      expect(game.p1.units()).toContain(id);
      expect(game.state(id)).toMatchObject({ damage: 0, might: 3 });
    }
    expect(game.p1.trash()).toEqual(["ge"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
