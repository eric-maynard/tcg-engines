/**
 * Interaction (LIVE CLIENT): Singularity into a CROWDED row carrying two different [Deflect] taxes.
 *
 *   Singularity      (ogn-105-298) 6 + [mind][mind] — "Deal 6 to each of up to two units."
 *   Pouty Poro       (ogn-013-298) 2 Might — [Deflect]   (1 pip to choose it)
 *   Volibear, Furious (ogn-041-298) 9 Might — [Deflect 2] (2 pips to choose it)
 *   Shipyard Skulker (ogn-175-298) 3 Might vanilla — the other six bodies
 *
 * Q: The opponent has EIGHT units at one battlefield, among them Pouty Poro and Volibear, and P1
 *    plays Singularity. At 8-a-side, is every one of the eight actually clickable in the crowded
 *    row (no occlusion, no scrollbar, all inside the row)? And does the cost grow per CHOICE —
 *    nothing extra before a pick, +1 with the Poro, +3 once Volibear joins?
 *
 * Rules: 809.1.c ([Deflect] is an additional cost paid once per time a spell chooses that object —
 * summed over the set) · 809.1.c.1 (payable with power of ANY Domain) · 809.2 · 355.5 (targets are
 * chosen as the spell is played) · 355.6 (targeting) · plus the client's own layout invariant that
 * a battlefield stays ONE addressable row.
 *
 * Gated like the rest of the live suite: RB_BROWSER_TESTS=1 plus an app on RB_BROWSER_URL. The
 * enemy board is built with the sandbox `duplicateCard` move — the goldfish never plays units.
 */
import { afterEach, expect, test } from "bun:test";
import { P1, P2 } from "../../../harness";
import type { PwPage } from "../../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "../../harness-browser/_gate";
import type { LiveGame } from "../../harness-browser/_live";
import { launchTest, movesOf } from "../../harness-browser/_live";
import * as ui from "../../harness-browser/_ui";

const SINGULARITY = "ogn-105-298";
const POUTY_PORO = "ogn-013-298";
const VOLIBEAR = "ogn-041-298";
const SKULKER = "ogn-175-298";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

/** Stand `defId` at `bf` under P2's control (sandbox duplicateCard — no turn/timing gate). */
async function standUp(l: LiveGame, defId: string, bf: string): Promise<string> {
  const before = new Set(l.game.p2.units(bf));
  const { cardId } = await l.backend.tutor(defId, P2);
  const r = await l.backend.raw(P2, "duplicateCard", { cardId, destinationZone: `battlefield-${bf}` });
  if (!r.ok) {
    throw new Error(`duplicateCard(${defId} → ${bf}) failed`);
  }
  await l.backend.refresh();
  const spawned = l.game.p2.units(bf).find((id) => !before.has(id));
  if (spawned === undefined) {
    throw new Error(`duplicateCard(${defId}) produced no unit at ${bf}`);
  }
  return spawned;
}

interface Board {
  bf: string;
  page: PwPage;
  poro: string;
  volibear: string;
  skulkers: string[];
  sing: string;
}

/** Eight enemy units at one battlefield (Poro + Volibear + six Skulkers); Singularity in P1's hand. */
async function board(): Promise<Board> {
  live = await launchTest(BASE_URL);
  const { backend, game } = live;
  const page = backend.page;
  await ui.prepare(page);
  const bf = game.battlefields()[1] as string;
  const poro = await standUp(live, POUTY_PORO, bf);
  const volibear = await standUp(live, VOLIBEAR, bf);
  const skulkers: string[] = [];
  for (let i = 0; i < 6; i++) {
    skulkers.push(await standUp(live, SKULKER, bf));
  }
  const { cardId: sing } = await backend.tutor(SINGULARITY, P1);
  await backend.refresh();
  return { bf, page, poro, sing, skulkers, volibear };
}

/** The target sets Singularity is currently offered with, as sorted id lists. */
function targetSets(l: LiveGame, sing: string): string[][] {
  return movesOf(l.backend, "playSpell")
    .filter((m) => m.params.cardId === sing)
    .map((m) => [...((m.params.targets as string[] | undefined) ?? [])].sort());
}

describeLive("Singularity at 8-a-side — crowded row addressability and the summed [Deflect] tax (809.1.c)", () => {
  test(
    "(1) layout: eight units stay ONE addressable row — nothing clipped out of it, no scrollbar, and every card (first, middle, last) is hittable and clickable",
    async () => {
      const { bf, page } = await board();
      const { game } = live as LiveGame;
      const units = game.p2.units(bf);
      expect(units).toHaveLength(8);

      expect(await ui.clippedElements(page, `.battlefield[data-drop-zone=${JSON.stringify(bf)}] .card`)).toEqual([]);
      const scroll = await page.evaluate<{ x: number; y: number } | null>(
        `(() => { const el = document.querySelector('.battlefield[data-drop-zone=${JSON.stringify(bf)}] .bf-body'); return el ? { x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight } : null; })()`,
      );
      expect(scroll?.x ?? 0).toBeLessThanOrEqual(2);
      expect(scroll?.y ?? 0).toBeLessThanOrEqual(2);

      for (const id of units) {
        const hit = await ui.hitPoint(page, id);
        expect(hit).not.toBeNull();
        expect(hit?.occludedBy).toBeNull();
      }
      // …and a real mouse click lands on each of them (clickCard throws when occluded).
      for (const id of [units[0] as string, units[4] as string, units[7] as string]) {
        await ui.clickCard(page, id);
      }
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "(2) targeting: all eight are glowing choices, the banner names Singularity, and one pick leaves it open with 'Done (1)'",
    async () => {
      const { bf, page, poro, sing } = await board();
      const { backend, game } = live as LiveGame;
      await backend.addResources(P1, { power: { mind: 3 } });
      await backend.refresh();

      await ui.clickCard(page, sing);
      const banner = await ui.targetBanner(page);
      expect(banner?.text).toBe("Choose a target for Singularity — Esc to cancel");
      expect([...(banner?.validTargets ?? [])].sort()).toEqual([...game.p2.units(bf)].sort());
      expect(banner?.buttons).toContain("No target"); // "up to two" includes zero
      expect(await ui.modal(page)).toMatchObject({ visible: false });

      await ui.clickCard(page, poro);
      const second = await ui.targetBanner(page);
      expect(second?.text).toContain("Pouty Poro");
      expect(second?.text).toContain("pick another or Done");
      expect(second?.buttons).toContain("Done (1)");
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "(3) the tax is summed PER CHOICE (809.1.c): with only the printed [mind][mind] neither [Deflect] unit is offered at all, and one extra pip of any Domain buys the Poro but not Volibear",
    async () => {
      const { poro, sing, volibear } = await board();
      const { backend, game } = live as LiveGame;
      // DESIGN (DESIGN.md "Known deviations" — manual rune payment): the engine offers a play only
      // when the CURRENT pool covers it, rather than counting runes it could still tap/recycle
      // (rules 429.3 / 357.1.a would let the surcharge be funded inside the Pay step).
      expect(game.p1.resources()).toMatchObject({ power: { mind: 2 } }); // exactly the printed cost
      let sets = targetSets(live as LiveGame, sing);
      expect(sets).toHaveLength(22); // 1 empty + 6 singles + 15 pairs, all from the six vanillas
      expect(sets.flat()).not.toContain(poro);
      expect(sets.flat()).not.toContain(volibear);

      // +1 pip: the Poro (Deflect 1) becomes choosable; Volibear (Deflect 2) still does not.
      await backend.addResources(P1, { power: { fury: 1 } }); // 809.1.c.1 — any Domain pays it
      await backend.refresh();
      sets = targetSets(live as LiveGame, sing);
      expect(sets.some((s) => s.includes(poro))).toBe(true);
      expect(sets.some((s) => s.includes(volibear))).toBe(false);
      expect(sets.some((s) => s.includes(poro) && s.includes(volibear))).toBe(false);

      // +3 in total: every set of up to two of the eight is legal, including the 1+2 = 3 pair.
      await backend.addResources(P1, { power: { mind: 2 } });
      await backend.refresh();
      sets = targetSets(live as LiveGame, sing);
      expect(sets).toHaveLength(37); // 1 + 8 + 28
      expect(sets.some((s) => s.includes(poro) && s.includes(volibear))).toBe(true);
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "(4) the two picks dispatch ONE playSpell carrying both ids — the Poro pick does not fire early",
    async () => {
      const { page, poro, sing, volibear } = await board();
      const { backend } = live as LiveGame;
      await backend.addResources(P1, { power: { mind: 3 } });
      await backend.refresh();

      await ui.clickCard(page, sing);
      const got = await ui.capture(page, async () => {
        await ui.clickCard(page, poro);
        await ui.clickCard(page, volibear);
      });
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ moveId: "playSpell", params: { cardId: sing, playerId: P1 } });
      expect([...((got[0]?.params.targets as string[]) ?? [])].sort()).toEqual([poro, volibear].sort());
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "(5) the targeting surface quotes the running [Deflect] surcharge — [rainbow] once the Poro is chosen, [rainbow]x3 once Volibear joins (809.1.c)",
    async () => {
      const { page, poro, sing, volibear } = await board();
      const { backend } = live as LiveGame;
      await backend.addResources(P1, { power: { mind: 3 } });
      await backend.refresh();
      await ui.clickCard(page, sing);
      await ui.clickCard(page, poro);
      const banner = await ui.targetBanner(page);
      expect(`${banner?.text ?? ""} ${(banner?.buttons ?? []).join(" ")}`).toMatch(/rainbow|Deflect|surcharge/i);
      expect(banner?.text).toContain("[Deflect] surcharge [rainbow]");
      await ui.clickCard(page, volibear);
      const both = await ui.targetBanner(page);
      expect(both?.text).toContain("[Deflect] surcharge [rainbow][rainbow][rainbow]");
    },
    LIVE_TIMEOUT * 2,
  );

  test(
    "(6) resolution: 6 to each of the two chosen — the 2-Might Poro dies, the 9-Might Volibear lives at 6 damage, the other six are untouched, and the pool is exactly 3 pips lighter",
    async () => {
      const { bf, poro, sing, skulkers, volibear } = await board();
      const { backend, game } = live as LiveGame;
      await backend.addResources(P1, { power: { mind: 3 } });
      await backend.refresh();
      const energyBefore = game.p1.energy();

      await game.p1.cast(sing, { targets: [poro, volibear] });
      await game.settle();

      expect(game.zoneOf(poro)).toBe("trash");
      expect(game.zoneOf(volibear)).toBe(`battlefield-${bf}`);
      expect(game.state(volibear).damage).toBe(6);
      for (const s of skulkers) {
        expect(game.state(s).damage).toBe(0);
        expect(game.zoneOf(s)).toBe(`battlefield-${bf}`);
      }
      expect(game.p1.energy()).toBe(energyBefore - 6);
      expect(game.p1.power("mind")).toBe(0); // 2 printed + 3 surcharge out of the 5 held
      expect(game.zoneOf(sing)).toBe("trash");
    },
    LIVE_TIMEOUT * 2,
  );
});
