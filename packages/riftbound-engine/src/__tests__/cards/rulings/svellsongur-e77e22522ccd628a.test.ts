/**
 * Ruling e77e22522ccd628a — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [3] · +0
 *     "[Equip] [1][calm] · As this is attached to a unit, copy that unit's text to this Equipment's effect text
 *      for as long as this is attached to it."
 *   × Last Rites (SFD-150 → sfd-150-221) · Equipment · +2 · effect text: "When I conquer or hold, you may play a
 *     unit from your trash."
 *
 * Q: Does Svellsongur copy equipment effect text that has been appended to a unit's rules text, or only the
 *    unit's own printed text?
 * A: Only the unit's printed text. Another equipment's effect text sitting on the same unit is not copied, so a
 *    Bearer wearing both Last Rites and Svellsongur conquers with ONE "play a unit from your trash", not two.
 * Rules: 718.3 (an Equipment's Effect Text is appended to the equipped unit), 613/copy rules (a copy takes the
 *        printed/copiable text only — nothing appended or granted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const LAST_RITES = "sfd-150-221";

/**
 * P1's turn with [2]. bf1 is open. A vanilla Bearer (3) in base wears Last Rites (+2) and, when `svell` is set,
 * Svellsongur as well. A 2-cost Recruit waits in the trash for Last Rites' offer.
 */
function board(svell: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: svell ? ["rites", "svell"] : ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, { cardType: "unit", energyCost: 2, might: 4, name: "Recruit" }, "recruit");
  if (svell) {
    s.card("svell", { def: SVELLSONGUR, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" });
  }
  return s;
}

/** Walk the Bearer onto the empty bf1 and count every "you may play a unit from your trash" offer. */
async function conquerAndCountOffers(game: Game): Promise<number> {
  let offers = 0;
  await game.p1.move("bearer", "bf1");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no") {
      offers++;
      await game.seat(d.seat).no();
      continue;
    }
    if (d?.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return offers;
}

describe("Ruling e77e22522ccd628a — Svellsongur copies the unit's printed text, not another equipment's appended text", () => {
  test("baseline: the Bearer wearing only Last Rites gets exactly one offer when it conquers", async () => {
    const game = await board(false).build();
    expect(game.state("bearer").might).toBe(5); // 3 + Last Rites' +2
    expect(await conquerAndCountOffers(game)).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: adding Svellsongur to the same unit does NOT duplicate that offer — still exactly one", async () => {
    const game = await board(true).build();
    expect(game.state("bearer").attachments.sort()).toEqual(["rites", "svell"]);
    expect(await conquerAndCountOffers(game)).toBe(1); // 2 would mean the appended text got copied
    expect(game.violations()).toEqual([]);
  });

  test("Svellsongur itself never becomes a second source of that trigger — the single offer comes from the Bearer", async () => {
    const game = await board(true).build();
    await game.p1.move("bearer", "bf1");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context !== "main") {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bearer" } });
    await game.p1.no();
    expect(game.decision()).not.toMatchObject({ kind: "yes-no" }); // nothing queued behind it
  });

  test("accepting the one offer plays the Recruit from the trash for its own [2] — and there is no second play", async () => {
    const game = await board(true).build();
    await game.p1.move("bearer", "bf1");
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.seat(d.seat).yes();
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1) {
        const recruit = d.options.find((o) => (o.card ?? o.key) === "recruit");
        await game.p1.pick(recruit ? "recruit" : "base");
        continue;
      }
      if (d?.kind === "action" && d.context !== "main") {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    expect(game.p1.units()).toContain("recruit");
    expect(game.p1.energy()).toBe(0); // paid once
    expect(game.p1.trash()).not.toContain("recruit");
    expect(game.violations()).toEqual([]);
  });
});
