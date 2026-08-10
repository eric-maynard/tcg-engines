/**
 * Ruling 4774e074a8f72fe8 — Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Dusk Rose Lab (UNL-209 → unl-209-219) · Battlefield · "At the start of your Beginning Phase, you may kill a unit
 *     you control here to draw 1."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time." —
 *     here a TEMPORARY Karthus (Temporary: "at the start of your Beginning Phase, kill me").
 *
 * Q: Temporary Karthus and Watchful Sentry sit on my Dusk Rose Lab. If I feed the Sentry to the Lab, do I draw 3?
 * A: Yes. At the start of the Beginning Phase both the Temporary kill and the Lab trigger; the controller orders
 *    them and resolves the Lab first. Killing the Sentry fires its Deathknell, doubled by the still-present Karthus
 *    (2 draws) + the Lab's own draw = 3. Karthus's Temporary then resolves and he dies.
 * Rules: 315.2 (Beginning Step triggers), 383.3.d (controller orders simultaneous triggers), 808 (Deathknell),
 *        Karthus passive applies while he is on the board.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
const DUSK_ROSE_LAB = "unl-209-219";
const KARTHUS = "ogn-236-298";
const TEMPORARY = { grantedKeywords: [{ duration: "permanent", keyword: "Temporary" }] } as const;

/** P2 is about to end turn 2. P1 controls Dusk Rose Lab (live) holding a Temporary Karthus and a Watchful Sentry. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .unit(P1, "lab", KARTHUS, "karthus", TEMPORARY)
    .unit(P1, "lab", WATCHFUL_SENTRY, "sentry")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
}

/** P2 ends the turn; P1 accepts the Lab and feeds it the Sentry. Returns at the first prompt after that. */
async function feedSentryToLab(): Promise<Game> {
  const game = await board().build();
  expect(game.state("karthus").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  // Both start-of-Beginning-Phase triggers are P1's: Karthus's Temporary and the Lab.
  expect(game.chain().map((c) => c.cardId).sort()).toEqual(["karthus", "lab"]);
  expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "lab" } });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "lab" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["karthus", "sentry"]); // "a unit you control here"
  await game.p1.pick("sentry");
  return game;
}

describe("Ruling 4774e074a8f72fe8 — Lab-fed Watchful Sentry beside a Temporary Karthus draws 3", () => {
  test("P1 (controller of both triggers) is offered the ordering; the Sentry's death puts TWO Deathknell items on the chain (Karthus is still on the board)", async () => {
    const game = await feedSentryToLab();
    // The Sentry died as the Lab's price; Karthus is alive, so its Deathknell triggered an additional time.
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("battlefield-lab");
    expect(game.chain().filter((c) => c.cardId === "sentry" && c.triggered)).toHaveLength(2);
    // Simultaneous triggers → the controller may order them.
    let sawOrder = false;
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        expect(d.seat).toBe(P1);
        expect(d.items.map((it) => it.card).sort()).toEqual(["karthus", "lab"]);
        sawOrder = true;
        await game.acceptTriggerOrder();
        break;
      }
      if (d?.kind === "action" && d.passKey) {
        break;
      }
    }
    expect(sawOrder).toBe(true);
  });

  test("resolution: the doubled Deathknell draws 2 and the Lab draws 1 — all while Karthus is still in play — then Karthus's Temporary kills him; P1 ends with 3 + 1 (draw step) = 4 cards", async () => {
    const game = await feedSentryToLab();
    // Walk the chain item by item, checking Karthus outlives every draw.
    let drawnWhileKarthusAlive = 0;
    for (let i = 0; i < 16 && game.phase() === "beginning"; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
        continue;
      }
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      const before = game.p1.hand().length;
      await game.seat(d.seat).pass();
      const gained = game.p1.hand().length - before;
      if (gained > 0 && game.zoneOf("karthus") === "battlefield-lab") {
        drawnWhileKarthusAlive += gained;
      }
    }
    expect(drawnWhileKarthusAlive).toBe(3); // 2 (Deathknell ×2 via Karthus) + 1 (Lab)
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("karthus")).toBe("trash"); // cleanup: Temporary resolved last
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3", "d4"]); // 3 from the triggers + the turn's draw
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Karthus: the same feed draws only 2 (Deathknell once + Lab) + 1 draw step = 3 cards", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .unit(P1, "lab", { might: 3, name: "Assistant" }, "assistant")
      .unit(P1, "lab", WATCHFUL_SENTRY, "sentry")
      .build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("sentry");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3);
  });
});
