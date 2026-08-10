/**
 * Ruling bd09815b36014d04 — Blade Dancer (Irelia legend, SFD-195 → sfd-195-221)
 *     "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it. When you conquer, you may pay
 *      [1] to ready me."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *
 * Q: When Zhonya's "triggers" (saves a unit), can I use Blade Dancer's ability on that unit?
 * A: No. Zhonya's is a replacement effect; the unit it saves is not "chosen"/targeted (355.10.c), so Blade Dancer's
 *    "when you choose a friendly unit" does not trigger off the save.
 * Rules: 355.10.c (objects named only by a replacement effect are not targets), 371–373 (replacement effects), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE_DANCER = "sfd-195-221";
const ZHONYAS = "ogn-077-298";
const EN_GARDE = "ogn-046-298"; // Reaction · 1 · "Give a friendly unit +1 Might this turn, …" — a real "choose" for the contrast

const isBladeDancerOffer = (d: Decision | null) =>
  !!d && d.seat === P1 && (d.kind === "yes-no" || d.kind === "pick") && (d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt));

describe("Ruling bd09815b36014d04 — a Zhonya's save is not a 'choose': Blade Dancer stays silent", () => {
  test("P2's 5-Might Raider crushes P1's lone Disciple (2) at bf1; Zhonya's replaces the death (Hourglass killed instead; Disciple healed, EXHAUSTED, recalled) — and at no point is P1 offered Blade Dancer's 'exhaust me + pay [rainbow] to ready it': the legend stays ready, the rainbow unspent, the Disciple stays exhausted", async () => {
      const game = await scenario()
        .active(P2)
        .resources(P1, { power: { rainbow: 1 } })
        .legend(P1, BLADE_DANCER, "bd")
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 2, name: "Disciple" }, "disciple")
        .gear(P1, ZHONYAS, "zhonyas")
        .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
        .build();
      let offered = false;
      game.script(P1, [
        (d) => {
          if (isBladeDancerOffer(d)) {
            offered = true;
          }
          return undefined;
        },
      ]);
      await game.p2.move("raider", "bf1");
      for (let i = 0; i < 30; i++) {
        const d = game.decision();
        if (!d || (d.kind === "action" && d.context === "main")) {
          break;
        }
        if (isBladeDancerOffer(d)) {
          offered = true;
          break;
        }
        const r = await game.settle({ maxSteps: 1 });
        if (r.reason === "unanswered") {
          break;
        }
      }
      await game.settle();
      // Zhonya's did its thing …
      expect(game.zoneOf("zhonyas")).toBe("trash");
      expect(game.zoneOf("disciple")).toBe("base");
      expect(game.state("disciple")).toMatchObject({ damage: 0, isExhausted: true });
      expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // Raider conquered the emptied bf1
      // … and Blade Dancer never triggered.
      expect(offered).toBe(false);
      expect(isBladeDancerOffer(game.decision())).toBe(false);
      expect(game.state("bd").isReady).toBe(true);
      expect(game.p1.power("rainbow")).toBe(1);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
      expect(game.violations()).toEqual([]);
    });

  test("contrast — actually CHOOSING the exhausted Disciple (P1's own En Garde) does trigger Blade Dancer: P1 is offered it, accepts (legend exhausted, [rainbow] paid) and the Disciple is readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .legend(P1, BLADE_DANCER, "bd")
      .unit(P1, "base", { might: 2, name: "Disciple" }, "disciple", { exhausted: true })
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, EN_GARDE, "engarde")
      .build();
    await game.p1.cast("engarde", { targets: "disciple" });
    let offers = 0;
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (isBladeDancerOffer(d)) {
        offers += 1;
        expect(d).toMatchObject({ seat: P1 });
        if (d.kind === "yes-no") {
          await game.p1.yes();
        } else if (d.kind === "pick") {
          await game.p1.pick(d.options[0]?.key as string);
        }
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(offers).toBe(1);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("disciple")).toMatchObject({ isReady: true, might: 4 }); // readied by Blade Dancer; En Garde +1 (+1 alone)
    expect(game.violations()).toEqual([]);
  });
});
