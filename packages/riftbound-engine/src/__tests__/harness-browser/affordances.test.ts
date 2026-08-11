/**
 * UI affordance suite (gated — see _gate.ts): for every move kind the engine
 * enumerates for the viewing player, the live client shows a discoverable,
 * human-labelled control in the expected place, and using it dispatches that
 * move. Plus board-layout invariants at 1440×900 and 1920×1080.
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/affordances.test.ts
 *
 * The table these tests back is docs/harness/UI-AFFORDANCES.md.
 */

import { afterEach, expect, test } from "bun:test";
import { P1, P2 } from "../../harness";
import type { PwPage } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";
import type { LiveGame } from "./_live";
import { buildDeck, cycleTurn, fieldUnit, launchCustom, launchTest, movesOf } from "./_live";
import * as ui from "./_ui";

let live: LiveGame | undefined;

afterEach(async () => {
  await live?.close().catch(() => undefined);
  live = undefined;
});

/** No player-facing label may be a raw engine identifier (camelCase moveId, effect id, instance id). */
const RAW_ID = /\b(?:play(?:Unit|Spell|Gear|FromChampionZone)|equipCard|hideCard|revealHidden|resolvePendingChoice|activateAbility|standardMove|gankingMove|recallUnit|exhaustRune|recycleRune|passChainPriority|passShowdownFocus|create-token|player-[12]-(?:main|rune|legend|champion|bf)-)\b/;

/** Key-order-independent JSON for comparing dispatched params. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
      : x,
  );
}

/**
 * Play moves carry a display-only `params.quote` (the play-options cost quote the
 * client renders); it is not part of what the affordance under test dispatches.
 * Drop it so the literal expected shapes below stay exact about everything else.
 */
function sansQuote(got: readonly ui.Captured[]): ui.Captured[] {
  return got.map((c) => {
    const { quote: _quote, ...params } = c.params;
    return { ...c, params };
  });
}

function expectHuman(labels: readonly string[], what: string): void {
  for (const l of labels) {
    expect({ label: l, raw: RAW_ID.test(l), what }).toEqual({ label: l, raw: false, what });
    expect(l.trim().length, `${what}: empty label`).toBeGreaterThan(0);
  }
}

async function texts(page: PwPage): Promise<string[]> {
  return (await ui.actionButtons(page)).map((b) => b.text);
}

describeLive("affordances — sidebar, runes, plays, abilities, movement (default deck)", () => {
  test(
    "turn/rune basics: End Turn + Concede listed; rune click = exhaust, right-click = tap-then-recycle; expanded rune groups are reachable; no raw ids anywhere",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);

      const sections = await ui.actionSections(page);
      expect(sections[0]).toBe("Turn Actions");
      const btns = await ui.actionButtons(page);
      expect(btns.find((b) => b.text === "End Turn")?.reachable).toBe(true);
      expect(btns.some((b) => b.text === "Concede")).toBe(true);
      expectHuman(btns.map((b) => b.text), "initial action list");

      // Rune groups: collapsed sub-buttons become reachable (inside the scrollport) once expanded.
      expect(await ui.expandGroup(page, "recycleRune")).toBe(true);
      await page.waitForTimeout(350);
      const after = await ui.actionButtons(page);
      const sub = after.filter((b) => /Rune \((?:ready|exhausted)\)/.test(b.text));
      expect(sub.length).toBeGreaterThan(0);
      expect(sub.every((b) => b.reachable)).toBe(true);
      expect(await ui.clippedElements(page, "#actionsList .action-btn")).toEqual([]);

      // Left click on a rune → exhaustRune for THAT rune.
      const rune = game.p1.runes()[0] as string;
      const tap = await ui.capture(page, () => ui.clickCard(page, rune));
      expect(tap).toEqual([{ moveId: "exhaustRune", params: { playerId: P1, runeId: rune }, playerId: P1 }]);

      // Right click (ready rune) → auto-tap first (+1 energy) then recycle: rune ends in the rune deck, energy +1.
      const e0 = game.p1.energy();
      const seq0 = backend.seq();
      await ui.clickCard(page, rune, { button: "right" });
      await backend.waitFor(() => backend.seq() > seq0 && game.zoneOf(rune) === "runeDeck", { timeoutMs: 8000 });
      await game.settle();
      expect(game.zoneOf(rune)).toBe("runeDeck");
      expect(game.p1.energy()).toBe(e0 + 1);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT,
  );

  test(
    "plays from hand: single-click unit; Accelerate variant modal with cost text; targeted spell → banner + glow → click target; two plain spells get one row each; gear click",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      const p1 = game.p1;
      await ui.prepare(page);

      // Vanilla unit: exactly one variant → the click itself plays it (no confirmation step).
      const { cardId: unit } = await backend.tutor("sfd-018-221");
      expect(movesOf(backend, "playUnit").filter((m) => m.params.cardId === unit)).toHaveLength(1);
      expect(sansQuote(await ui.capture(page, () => ui.clickCard(page, unit)))).toEqual([{ moveId: "playUnit", params: { cardId: unit, location: "base", playerId: P1 }, playerId: P1 }]);
      expect((await texts(page)).some((t) => t.startsWith("Play Unit") && t.includes("Void Hatchling to base"))).toBe(true);
      await p1.play(unit);
      await game.settle({ policy: "first" });

      // Accelerate (ogn-010-298 Legion Rearguard): base + paid variants → play-options modal names the extra cost.
      const { cardId: acc } = await backend.tutor("ogn-010-298");
      await backend.addResources(P1, { power: { fury: 1 } });
      const accVariants = movesOf(backend, "playUnit").filter((m) => m.params.cardId === acc);
      expect(accVariants.length).toBe(2);
      await ui.clickCard(page, acc);
      const m = await ui.modal(page);
      expect(m).toMatchObject({ hasCancel: true, mode: "playCost", title: "Play Legion Rearguard", visible: true });
      expect(m.buttons.some((b) => /^Play to base\s*2 energy$/.test(b))).toBe(true);
      // The Accelerate row quotes the TOTAL actually paid (base 2 + Accelerate 1 energy + fury), not the increment.
      expect(m.buttons.some((b) => /Accelerate/.test(b) && /3 energy \+ 1 fury total/.test(b) && /enters ready/.test(b))).toBe(true);
      expectHuman(m.buttons, "accelerate modal");
      const paid = accVariants.find((v) => v.params.paidAdditionalCost) as (typeof accVariants)[number];
      expect(await ui.capture(page, async () => void (await ui.clickModalButton(page, "Accelerate")))).toEqual([{ moveId: "playUnit", params: paid.params, playerId: P1 }]);
      expect((await texts(page)).some((t) => /^Play Legion Rearguard\s*2 play options/.test(t))).toBe(true);

      // Targeted spell (Cleave): click → targeting mode; legal targets glow = engine targets; click target → that variant.
      const { cardId: cleave } = await backend.tutor("ogn-004-298");
      const cleaveVariants = movesOf(backend, "playSpell").filter((v) => v.params.cardId === cleave);
      await ui.clickCard(page, cleave);
      const banner = await ui.targetBanner(page);
      expect(banner?.text).toBe("Choose a target for Cleave — Esc to cancel");
      expect([...(banner?.validTargets ?? [])].sort()).toEqual([...new Set(cleaveVariants.map((v) => (v.params.targets as string[])[0] as string))].sort());
      expect(sansQuote(await ui.capture(page, () => ui.clickCard(page, unit)))).toEqual([{ moveId: "playSpell", params: { cardId: cleave, playerId: P1, targets: [unit] }, playerId: P1 }]);
      await page.keyboard.press("Escape");

      // Two different untargeted spells never collapse into "Play Spell (2 options)": one labelled row per card.
      const { cardId: sd } = await backend.tutor("ogn-183-298");
      const { cardId: cs } = await backend.tutor("sfd-122-221");
      const list = await texts(page);
      expect(list.some((t) => /Play Spell \(\d+ options\)/.test(t))).toBe(false);
      expect(list.some((t) => t.startsWith("Play Spell") && t.includes("Stacked Deck"))).toBe(true);
      expect(list.some((t) => t.startsWith("Play Spell") && t.includes("Called Shot"))).toBe(true);
      expectHuman(list, "action list with spells");
      void sd;
      void cs;

      // Gear (Seal of Rage, 0 cost): single click plays it.
      const { cardId: seal } = await backend.tutor("ogn-040-298");
      expect(sansQuote(await ui.capture(page, () => ui.clickCard(page, seal)))).toEqual([{ moveId: "playGear", params: { cardId: seal, playerId: P1 }, playerId: P1 }]);
    },
    LIVE_TIMEOUT,
  );

  test(
    "board cards: gear/unit ability on the card bar (printed text) + Abilities section; Equip → targeting → equipCard; champion bar; move bar → showdown focus + cursor banner; held battlefield → 'Play to <bf>' + Hide at <bf>",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      const p1 = game.p1;
      await ui.prepare(page);
      const unit = await fieldUnit(live, "sfd-018-221");

      // Gear with an activated ability: bar names it by its printed "COST: effect"; sidebar Abilities section too.
      const { cardId: seal } = await backend.tutor("ogn-040-298");
      await p1.playGear(seal);
      await game.settle({ policy: "first" });
      await ui.clickCard(page, seal);
      let bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Gear: Seal of Rage");
      expect(bar?.buttons.map((b) => b.text)).toEqual(["[Exhaust]: [Reaction] — [Add] [fury]."]);
      expect(await ui.capture(page, async () => void (await ui.clickBarButton(page, "[Exhaust]")))).toEqual([{ moveId: "activateAbility", params: { abilityIndex: 0, cardId: seal, playerId: P1 }, playerId: P1 }]);
      expect(await ui.actionSections(page)).toContain("Abilities");
      expect((await texts(page)).some((t) => t.startsWith("Activate Ability") && t.includes("Seal of Rage — [Exhaust]: [Reaction] — [Add] [fury]."))).toBe(true);

      // Equipment on the board (Serrated Dirk): engine offers equipCard → "Equip [fury] → choose a unit" on the card + "Equip" row; targeting → unit → equipCard.
      const { cardId: dirk } = await backend.tutor("sfd-009-221");
      await backend.addResources(P1, { power: { fury: 2 } });
      await p1.playGear(dirk);
      await game.settle({ policy: "first" });
      const equips = movesOf(backend, "equipCard").filter((m) => m.params.equipmentId === dirk);
      expect(equips.length).toBeGreaterThan(0);
      expect((await texts(page)).some((t) => t.startsWith("Equip") && t.includes("Serrated Dirk — Equip [fury] → choose a unit"))).toBe(true);
      expect(await page.evaluate<boolean>(`document.querySelector('[data-card-id="${dirk}"]').classList.contains("playable")`)).toBe(true);
      await ui.clickCard(page, dirk);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Equipment: Serrated Dirk");
      expect(bar?.buttons.map((b) => b.text)).toContain("Equip [fury] → choose a unit");
      let banner: Awaited<ReturnType<typeof ui.targetBanner>> = null;
      const tgt = equips[0]?.params.unitId as string;
      const eq = await ui.capture(page, async () => {
        await ui.clickBarButton(page, "Equip");
        banner = await ui.targetBanner(page);
        await ui.clickCard(page, tgt);
      });
      expect(banner!.text).toBe("Choose a target for Serrated Dirk — Esc to cancel");
      expect([...banner!.validTargets].sort()).toEqual([...new Set(equips.map((m) => m.params.unitId as string))].sort());
      expect(eq).toEqual([{ moveId: "equipCard", params: { equipmentId: dirk, playerId: P1, unitId: tgt }, playerId: P1 }]);

      // Champion: click → bar "Play Champion to Base" dispatches playFromChampionZone; sidebar row says "Play Champion".
      const champ = p1.champion() as string;
      const cs = game.state(champ);
      await backend.addResources(P1, { energy: cs.energyCost, power: Object.fromEntries(cs.powerCost.map((d) => [d, 1])) });
      const champVariants = movesOf(backend, "playFromChampionZone");
      expect(champVariants.length).toBeGreaterThan(0);
      const champRows = (await texts(page)).filter((t) => t.startsWith("Play Champion"));
      expect(champRows.length).toBe(1);
      expectHuman(champRows, "champion row");
      await ui.clickCard(page, champ);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe(`Champion: ${cs.name}`);
      const baseBtn = bar?.buttons.find((b) => b.text.startsWith("Play Champion to Base"));
      expect(baseBtn).toBeDefined();
      const champDispatch = await ui.capture(page, async () => {
        if (!(await ui.clickBarButton(page, "Play Champion to Base"))) {
          return;
        }
        if ((await ui.modal(page)).visible) {
          await ui.clickModalButton(page, "Play to base");
        }
      });
      expect(champDispatch[0]?.moveId).toBe("playFromChampionZone");
      expect(champDispatch[0]?.params.location).toBe("base");

      // Unit with a targeted activated ability (Arena Kingpin enters ready): bar shows Move + printed ability; ability → targeting.
      const king = await fieldUnit(live, "unl-001-219");
      await ui.clickCard(page, king);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Move to battlefield");
      const bfs = game.battlefields();
      expect(bar?.buttons.filter((b) => b.text.startsWith("Move to ")).length).toBe(bfs.length);
      expect(bar?.buttons.some((b) => b.text === "[Exhaust]: Give a unit +3 [Might] this turn.")).toBe(true);
      const mv = await ui.capture(page, async () => void (await ui.clickBarButton(page, "Move to")));
      expect(mv[0]).toMatchObject({ moveId: "standardMove", params: { unitIds: [king] } });

      // Real move → showdown: focus button on the battlefield panel + Pass Focus row + header says it's OUR cursor.
      await p1.move(king, bfs[0] as string);
      const d = game.decision();
      expect(d).toMatchObject({ context: "showdown", seat: P1 });
      expect(await page.evaluate<string[]>(`Array.from(document.querySelectorAll('.battlefield__showdown-panel button')).filter(b => b.offsetParent).map(b => b.textContent.replace(/\\s+/g,' ').trim())`)).toContain("Pass Focus W");
      expect(await texts(page)).toContain("Pass Focus");
      expect(await page.evaluate<string>(`document.querySelector('#sidebarHeader .game-status').textContent.trim()`)).toBe("You have focus — act or pass (Space)");
      const sp = await ui.capture(page, async () => {
        await page.evaluate(`(() => { window.__rbTurnActionInFlight = false; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); })()`);
        await page.keyboard.press("Space");
      });
      expect(sp[0]?.moveId).toBe("passShowdownFocus");
      await game.settle();
      expect(p1.battlefields({ controlled: true })).toContain(bfs[0] as string);

      // Held battlefield: a unit in hand now has base + battlefield destinations → modal names both.
      const { cardId: u2 } = await backend.tutor("sfd-018-221");
      await ui.clickCard(page, u2);
      const pm = await ui.modal(page);
      expect(pm.visible).toBe(true);
      expect(pm.buttons.some((b) => b.startsWith("Play to base"))).toBe(true);
      const heldName = await page.evaluate<string>(`getBattlefieldName(${JSON.stringify(bfs[0])})`);
      expect(pm.buttons.some((b) => b.startsWith(`Play to ${heldName}`))).toBe(true);
      await ui.clickModalButton(page, "Cancel");

      // Hidden card (Block): targeting banner also offers "Hide at <bf>" → hideCard; sidebar Hide row names the card.
      const { cardId: block } = await backend.tutor("ogn-057-298");
      await backend.addResources(P1, { power: { fury: 1 } });
      const hides = movesOf(backend, "hideCard").filter((m) => m.params.cardId === block);
      expect(hides.length).toBe(1);
      const bfName = await page.evaluate<string>(`getBattlefieldName(${JSON.stringify(hides[0]?.params.battlefieldId)})`);
      expect((await texts(page)).some((t) => t.startsWith("Hide Card") && t.includes(`Block at ${bfName}`))).toBe(true);
      await ui.clickCard(page, block);
      const hb = await ui.targetBanner(page);
      expect(hb?.buttons).toContain(`Hide at ${bfName}`);
      const hid = await ui.capture(page, () => page.evaluate(`Array.from(document.querySelectorAll('#targetBanner .target-banner-btn')).find(b => b.textContent.startsWith('Hide at')).click()`));
      expect(hid).toEqual([{ moveId: "hideCard", params: hides[0]?.params as Record<string, unknown>, playerId: P1 }]);
      expectHuman(await texts(page), "late action list");
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

describeLive("affordances — drag gestures & multi-target targeting", () => {
  test(
    "drag: unit → base, unit → held battlefield (location variant), champion → base, board Equipment → unit (equipCard); Singularity 'up to two': pick, pick → exact 2-target variant / Done(1) / No target",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      const p1 = game.p1;
      await ui.prepare(page);
      const sel = (id: string) => `#game-scale-wrapper [data-card-id=${JSON.stringify(id)}]`;

      // Hold a battlefield first (Kingpin enters ready → move → uncontested conquer).
      const king = await fieldUnit(live, "unl-001-219");
      const bf = game.battlefields()[0] as string;
      await p1.move(king, bf);
      await game.settle();
      expect(p1.battlefields({ controlled: true })).toContain(bf);

      // Hand unit dragged to BASE → base variant; dragged to the held battlefield → that location variant.
      const { cardId: u } = await backend.tutor("sfd-018-221");
      const variants = movesOf(backend, "playUnit").filter((m) => m.params.cardId === u);
      expect(variants.map((v) => v.params.location).sort()).toEqual(["base", `battlefield-${bf}`].sort());
      let got = await ui.capture(page, () => page.locator(sel(u)).first().dragTo(page.locator(`#player-base[data-drop-zone="player-base"]`).first(), { timeout: 4000 }));
      expect(sansQuote(got)).toEqual([{ moveId: "playUnit", params: { cardId: u, location: "base", playerId: P1 }, playerId: P1 }]);
      got = await ui.capture(page, () => page.locator(sel(u)).first().dragTo(page.locator(`.battlefield[data-drop-zone=${JSON.stringify(bf)}] .bf-body`).first(), { timeout: 4000 }));
      expect(sansQuote(got)).toEqual([{ moveId: "playUnit", params: { cardId: u, location: `battlefield-${bf}`, playerId: P1 }, playerId: P1 }]);

      // Champion dragged to base (single base variant → direct; several → modal "Play to base").
      const champ = p1.champion() as string;
      const cs = game.state(champ);
      await backend.addResources(P1, { energy: cs.energyCost, power: Object.fromEntries(cs.powerCost.map((d) => [d, 1])) });
      expect(movesOf(backend, "playFromChampionZone").length).toBeGreaterThan(0);
      expect(await page.evaluate<boolean>(`document.querySelector(${JSON.stringify(sel(champ))}).classList.contains("playable")`)).toBe(true);
      got = await ui.capture(page, async () => {
        await page.locator(sel(champ)).first().dragTo(page.locator(`#player-base[data-drop-zone="player-base"]`).first(), { timeout: 4000 });
        if ((await ui.modal(page)).visible) {
          await ui.clickModalButton(page, "Play to base");
        }
      });
      expect(got[0]).toMatchObject({ moveId: "playFromChampionZone", params: { location: "base" } });
      expect(got[0]?.params.paidAdditionalCost).toBeUndefined();

      // Board Equipment dragged onto a unit → equipCard for that unit.
      const sitter = await fieldUnit(live, "sfd-018-221");
      const { cardId: dirk } = await backend.tutor("sfd-009-221");
      await backend.addResources(P1, { power: { fury: 2 } });
      await p1.playGear(dirk);
      await game.settle({ policy: "first" });
      const eq = movesOf(backend, "equipCard").find((m) => m.params.equipmentId === dirk && m.params.unitId === sitter);
      expect(eq).toBeDefined();
      got = await ui.capture(page, () => page.locator(sel(dirk)).first().dragTo(page.locator(sel(sitter)).first(), { timeout: 4000 }));
      expect(got).toEqual([{ moveId: "equipCard", params: eq?.params as Record<string, unknown>, playerId: P1 }]);

      // "Up to two units" (Singularity): first pick keeps targeting open (Done (1) offered), second pick plays the 2-target variant; "No target" exists for zero.
      const { cardId: sing } = await backend.tutor("ogn-105-298");
      const sv = movesOf(backend, "playSpell").filter((m) => m.params.cardId === sing);
      const two = sv.find((m) => (m.params.targets as string[]).length === 2 && new Set(m.params.targets as string[]).size === 2);
      expect(two).toBeDefined();
      const [t1, t2] = two?.params.targets as [string, string];
      await ui.clickCard(page, sing);
      let banner = await ui.targetBanner(page);
      expect(banner?.text).toBe("Choose a target for Singularity — Esc to cancel");
      expect(banner?.buttons).toContain("No target");
      let second: Awaited<ReturnType<typeof ui.targetBanner>> = null;
      got = await ui.capture(page, async () => {
        await ui.clickCard(page, t1);
        second = await ui.targetBanner(page);
        await ui.clickCard(page, t2);
      });
      expect(second!.text).toContain("pick another or Done");
      expect(second!.buttons).toContain("Done (1)");
      expect(second!.validTargets).toContain(t2);
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ moveId: "playSpell", params: { cardId: sing } });
      expect([...(got[0]?.params.targets as string[])].sort()).toEqual([t1, t2].sort());
      // Done (1) → the single-target variant for the first pick.
      await ui.clickCard(page, sing);
      got = await ui.capture(page, async () => {
        await ui.clickCard(page, t1);
        await page.evaluate(`Array.from(document.querySelectorAll('#targetBanner .target-banner-btn')).find(b => b.textContent.startsWith('Done')).click()`);
      });
      expect(sansQuote(got)).toEqual([{ moveId: "playSpell", params: { cardId: sing, playerId: P1, targets: [t1] }, playerId: P1 }]);
      banner = await ui.targetBanner(page);
      expect(banner).toBeNull();
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

describeLive("affordances — legend ability, battlefield units, hidden, chain & live prompts (custom deck)", () => {
  test(
    "Blind Monk legend: printed ability on the legend bar → targeting → activateAbility; unaffordable → greyed with reason; gank/recall bar; facedown → Reveal; chain overlay names targets; reveal-and-pick / opt-in / choose-target / choose-mode prompts are labelled",
    async () => {
      const deck = await buildDeck({ domains: ["calm", "body"], legendId: "ogn-257-298" });
      live = await launchCustom(BASE_URL, deck);
      const { backend, game } = live;
      const page = backend.page;
      const p1 = game.p1;
      await ui.prepare(page);

      // ---- legend ability ------------------------------------------------------
      const unit = await fieldUnit(live, "sfd-018-221");
      await backend.addResources(P1, { energy: 2 });
      const legend = p1.legend() as string;
      const legendVariants = movesOf(backend, "activateAbility").filter((m) => m.params.cardId === legend);
      expect(legendVariants.length).toBeGreaterThan(0);
      expect(await page.evaluate<string>(`document.querySelector('[data-card-id="${legend}"]').className`)).toContain("legend-playable");
      await ui.clickCard(page, legend);
      let bar = await ui.actionBar(page);
      expect(bar).toEqual({ buttons: [{ disabled: false, reachable: true, text: "[1], [Exhaust]: Buff a friendly unit.", title: "[1], [Exhaust]: Buff a friendly unit." }], label: "Legend: Blind Monk" });
      let banner: Awaited<ReturnType<typeof ui.targetBanner>> = null;
      const act = await ui.capture(page, async () => {
        await ui.clickBarButton(page, "Buff");
        banner = await ui.targetBanner(page);
        await ui.clickCard(page, unit);
      });
      expect(banner!.text).toBe("Choose a target for Blind Monk — Esc to cancel");
      expect(act).toEqual([{ moveId: "activateAbility", params: { abilityIndex: 0, cardId: legend, playerId: P1, targets: [unit] }, playerId: P1 }]);
      expect((await texts(page)).some((t) => t.startsWith("Activate Ability") && t.includes("Blind Monk — [1], [Exhaust]: Buff a friendly unit."))).toBe(true);
      // Not usable (used it → legend exhausted): the legend still answers the click, greyed out, with the reason.
      await p1.activate(legend, 0, { targets: unit });
      await game.settle({ policy: "first" });
      expect(game.state(legend).isExhausted).toBe(true);
      expect(movesOf(backend, "activateAbility").filter((m) => m.params.cardId === legend)).toHaveLength(0);
      await ui.clickCard(page, legend);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Legend: Blind Monk");
      expect(bar?.buttons).toEqual([{ disabled: true, reachable: true, text: "[1], [Exhaust]: Buff a friendly unit. — Already exhausted", title: "Already exhausted" }]);
      await page.evaluate(`cancelInteraction()`);

      // ---- ganking unit at a battlefield: Gank / Recall on the card bar -----------
      const vi = await fieldUnit(live, "ogn-036-298");
      await cycleTurn(live);
      const bfs = game.battlefields();
      await p1.move(vi, bfs[0] as string);
      await game.settle();
      await cycleTurn(live);
      const ganks = movesOf(backend, "gankingMove").filter((m) => m.params.unitId === vi);
      expect(ganks.length).toBeGreaterThan(0);
      await ui.clickCard(page, vi);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Unit: Vi, Destructive");
      const gankBtn = bar?.buttons.find((b) => b.text.startsWith("Gank to "));
      expect(gankBtn).toBeDefined();
      expect(await ui.capture(page, async () => void (await ui.clickBarButton(page, "Gank to")))).toEqual([{ moveId: "gankingMove", params: ganks[0]?.params as Record<string, unknown>, playerId: P1 }]);
      const recalls = movesOf(backend, "recallUnit").filter((m) => m.params.unitId === vi);
      if (recalls.length) {
        await ui.clickCard(page, vi);
        expect(await ui.capture(page, async () => void (await ui.clickBarButton(page, "Recall")))).toEqual([{ moveId: "recallUnit", params: recalls[0]?.params as Record<string, unknown>, playerId: P1 }]);
      }
      expect((await texts(page)).some((t) => t.startsWith("Ganking Move") && t.includes("Vi, Destructive to "))).toBe(true);

      // ---- Hidden: hide Block at the held battlefield; next turn the facedown card offers Reveal ----
      const held = p1.battlefields({ controlled: true });
      expect(held.length).toBeGreaterThan(0);
      const { cardId: block } = await backend.tutor("ogn-057-298");
      await backend.addResources(P1, { power: { calm: 1 } });
      const hide = movesOf(backend, "hideCard").find((m) => m.params.cardId === block);
      expect(hide).toBeDefined();
      await p1.hide(block, hide?.params.battlefieldId as string);
      await game.settle();
      // Same turn: rendered facedown at the battlefield, Reveal greyed with the reason.
      expect(await page.evaluate<number>(`document.querySelectorAll('.bf-facedown [data-card-id="${block}"]').length`)).toBe(1);
      await ui.clickCard(page, block);
      bar = await ui.actionBar(page);
      expect(bar?.label).toBe("Hidden: Block");
      expect(bar?.buttons[0]).toMatchObject({ disabled: true });
      expect(bar?.buttons[0]?.text).toStartWith("Reveal");
      await page.evaluate(`cancelInteraction()`);
      await cycleTurn(live);
      const reveal = movesOf(backend, "revealHidden").find((m) => m.params.cardId === block);
      expect(reveal).toBeDefined();
      expect((await texts(page)).some((t) => t.startsWith("Reveal Hidden") && t.includes("Block"))).toBe(true);
      await ui.clickCard(page, block);
      bar = await ui.actionBar(page);
      expect(bar?.buttons.map((b) => b.text)).toEqual(["Reveal (play for 0)"]);
      expect(await ui.capture(page, async () => void (await ui.clickBarButton(page, "Reveal")))).toEqual([{ moveId: "revealHidden", params: reveal?.params as Record<string, unknown>, playerId: P1 }]);

      // ---- chain overlay: a targeted spell on the chain shows "→ <target name>" and Pass ----
      const { cardId: ward } = await backend.tutor("ogn-057-298"); // Block again, cast normally on a unit
      await backend.addResources(P1, { power: { calm: 1 } });
      const target = (movesOf(backend, "playSpell").find((m) => m.params.cardId === ward)?.params.targets as string[])[0] as string;
      await p1.cast(ward, { targets: target });
      const chainDom = await page.evaluate<{ visible: boolean; what: string[]; pass: boolean }>(
        `(() => { const o = document.getElementById('chainOverlay'); return { visible: o.classList.contains('visible'), what: Array.from(o.querySelectorAll('[data-chain-what]')).map(e => e.textContent.trim()), pass: !!o.querySelector('.chain-pass-btn') }; })()`,
      );
      expect(chainDom.visible).toBe(true);
      expect(chainDom.pass).toBe(true);
      expect(chainDom.what.some((w) => w.includes(`→ ${game.state(target).name}`))).toBe(true);
      expectHuman(chainDom.what, "chain item detail");
      await game.settle();

      // ---- reveal-and-pick (Stacked Deck): card tiles are labelled, keyboard-operable buttons ----
      const { cardId: sd } = await backend.tutor("ogn-183-298");
      await p1.cast(sd);
      let s = await game.settle();
      expect(s.reason).toBe("unanswered");
      let m = await ui.modal(page);
      expect(m).toMatchObject({ mode: "pending", visible: true });
      // The prompt says where the cards are and what happens to picked / unpicked ones; every tile carries its action.
      expect(m.title).toBe("Stacked Deck — The top 3 cards of your Main Deck: pick 1 to draw, the rest go to the bottom");
      expect(m.cards.length).toBe(3);
      expect(m.cards.every((c) => c.eligible && / — Draw it$/.test(c.label) && !RAW_ID.test(c.label))).toBe(true);
      expect(m.buttons.filter((b) => b === "Draw it")).toHaveLength(3);
      expect(await page.evaluate<string>(`document.querySelector('#choiceOverlay [data-rp-instruction]').textContent`)).toContain("Cards you don't pick go to the bottom of your deck");
      expect(await page.evaluate<string>(`document.querySelector('#choiceOverlay [data-rp-seen]').textContent`)).toContain("Looked at privately");
      expect(await page.evaluate<string>(`document.querySelector('#choiceOverlay .choice-modal-card[data-pick-idx]').getAttribute('role')`)).toBe("button");
      // Sidebar duplicates stay clickable through the dimmed backdrop (no dead controls, no raw ids).
      const pendBtns = await ui.actionButtons(page);
      expectHuman(pendBtns.map((b) => b.text), "pending sidebar");
      expect(pendBtns.some((b) => /options\)$/.test(b.text))).toBe(false);
      expect(await page.evaluate<string>(`getComputedStyle(document.getElementById('choiceOverlay')).pointerEvents`)).toBe("none");
      const pick = await ui.capture(page, () => page.evaluate(`document.querySelector('#choiceOverlay .choice-modal-card[data-pick-idx="1"]').click()`));
      expect(pick[0]).toMatchObject({ moveId: "resolvePendingChoice" });
      expect(typeof pick[0]?.params.pickedCardId).toBe("string");
      await game.settle({ policy: "first" });

      // ---- opt-in (Disarming Rake: "you may kill a gear") → Yes/No titled by the source; then choose-target ----
      const { cardId: seal } = await backend.tutor("ogn-040-298");
      await p1.playGear(seal);
      await game.settle({ policy: "first" });
      const { cardId: rake } = await backend.tutor("sfd-032-221");
      await p1.play(rake, { to: "base" });
      s = await game.settle();
      expect(s.reason).toBe("unanswered");
      expect((backend.currentFrame.snapshot.pendingChoice as { type?: string } | undefined)?.type).toBe("opt-in");
      m = await ui.modal(page);
      expect(m).toMatchObject({ title: "Use Disarming Rake ability?", visible: true });
      expect([...m.buttons].sort()).toEqual(["No", "Yes"]);
      expect(await page.evaluate<string>(`document.querySelector('#actionsList [data-pending-type]').textContent.trim()`)).toBe("⚠ Use Disarming Rake ability?");
      expect(await ui.capture(page, async () => void (await ui.clickModalButton(page, "Yes")))).toEqual([{ moveId: "resolvePendingChoice", params: { accept: true, playerId: P1 }, playerId: P1 }]);
      await p1.answer(true);
      await backend.refresh();
      const ct = backend.currentFrame.snapshot.pendingChoice as { type?: string; options?: string[] } | undefined;
      if (ct?.type === "choose-target") {
        m = await ui.modal(page);
        expect(m.title).toBe("Choose a target for Disarming Rake");
        expect(m.cards.filter((c) => c.eligible).map((c) => c.id).sort()).toEqual([...(ct.options ?? [])].sort());
        // Board glow mirrors the modal and the backdrop lets the click through.
        expect(await page.evaluate<boolean>(`document.getElementById('choiceOverlay').classList.contains('targeting')`)).toBe(true);
        expect((await page.evaluate<string[]>(`Array.from(document.querySelectorAll('#game-scale-wrapper .valid-target[data-card-id]')).map(e => e.dataset.cardId)`)).sort()).toEqual([...(ct.options ?? [])].sort());
      }
      await game.settle({ policy: "first" });

      // ---- choose-mode at resolution (Rocket Barrage): buttons carry the printed bullets ----
      const { cardId: rb } = await backend.tutor("sfd-077-221");
      await p1.cast(rb);
      s = await game.settle();
      const pm = backend.currentFrame.snapshot.pendingChoice as { type?: string; optionLabels?: string[] } | undefined;
      if (s.reason === "unanswered" && pm?.type === "choose-mode") {
        m = await ui.modal(page);
        expect(m.title).toBe("Rocket Barrage — choose one");
        expectHuman(m.buttons, "choose-mode buttons");
        expect(m.buttons.some((b) => /Deal 4/.test(b))).toBe(true);
        expect(m.buttons.some((b) => /Kill a gear/i.test(b))).toBe(true);
        await game.settle({ policy: "first" });
      }
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );
});

// ---------------------------------------------------------------------------
// Every pendingChoice TYPE the engine can park, injected client-side with an
// engine-shaped resolvePendingChoice menu: the modal is titled, every control
// is human-labelled, and using it dispatches the matching params.
// ---------------------------------------------------------------------------

interface Synthetic {
  readonly name: string;
  readonly pending: Record<string, unknown>;
  readonly variants: readonly Record<string, unknown>[];
  readonly title: string | RegExp;
  /** Expected button labels (subset, in any order) — cards are checked via `cards`. */
  readonly buttons?: readonly string[];
  readonly cards?: number;
  /** Perform the answer in the DOM; the captured params must equal `expectParams`. */
  readonly act: string;
  readonly expectParams: Record<string, unknown>;
}

describeLive("affordances — every pendingChoice type renders a titled, labelled, working control (synthetic prompts)", () => {
  test(
    "opt-in(+cost) · confirm · choose-target · choose-destination · choose-mode · reveal-and-pick × {recycle-from-hand, Vision, look-2 upTo, draw+rest, play, banish, discard×2 multi} · opt-in Burn · name-card · choose-player · combat-damage · weaponmaster · pay-x stepper · order sequence · order-cards · pick-many checkboxes · die-order/die-assign titles · trigger-order soft panel · zoom closes under a prompt",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      // Board fixtures the prompts can point at: two of our units, one of theirs, our legend.
      const a = await fieldUnit(live, "sfd-018-221");
      const b = await fieldUnit(live, "unl-001-219");
      // An enemy unit: tokens can be added to any seat's base in sandbox (P2 cannot play cards on our turn).
      const tok = await backend.raw(P2, "addToken", { tokenName: "Recruit", zoneId: "base" });
      expect(tok.ok).toBe(true);
      await backend.refresh();
      const foe = game.p2.units("base")[0] as string;
      expect(foe).toBeDefined();
      const legend = game.p1.legend() as string;
      const hand = game.p1.hand();
      const deck = (backend.currentFrame.snapshot.zones.mainDeck ?? []).filter((c) => c.owner === P1).map((c) => c.id);
      expect(deck.length).toBeGreaterThanOrEqual(3);
      const foeSeat = P2;
      const foeHand = game.p2.hand();
      expect(foeHand.length).toBeGreaterThanOrEqual(2);
      const bf = game.battlefields()[0] as string;
      const bfName = await page.evaluate<string>(`getBattlefieldName(${JSON.stringify(bf)})`);
      const nameOf = (id: string) => game.state(id).name;

      const cases: Synthetic[] = [
        {
          act: `clickModalButton:Yes`,
          buttons: ["Yes", "No"],
          expectParams: { accept: true },
          name: "opt-in with cost",
          pending: { playerId: "$me", resolved: { optInCost: { energy: 2, power: ["fury"] } }, sourceCardId: b, type: "opt-in" },
          title: "Use Arena Kingpin ability? (pay 2 energy, fury)",
          variants: [{ accept: true }, { accept: false }],
        },
        {
          act: `clickModalButton:No`,
          buttons: ["Yes", "No"],
          expectParams: { accept: false },
          name: "confirm",
          pending: { effect: {}, playerId: "$me", prompt: "Banish the top card of your deck?", sourceCardId: b, type: "confirm" },
          title: "Banish the top card of your deck?",
          variants: [{ accept: true }, { accept: false }],
        },
        {
          act: `clickCard:${foe}`,
          cards: 2,
          expectParams: { pickedCardId: foe },
          name: "choose-target",
          pending: { effect: {}, options: [a, foe], playerId: "$me", remaining: 1, sourceCardId: b, type: "choose-target" },
          title: "Choose a target for Arena Kingpin",
          variants: [{ pickedCardId: a }, { pickedCardId: foe }],
        },
        {
          act: `clickModalButton:${bfName}`,
          buttons: ["Base", bfName, "Don't move"],
          expectParams: { pickedZoneId: `battlefield-${bf}` },
          name: "choose-destination (optional)",
          pending: { cardId: a, optional: true, options: ["base", `battlefield-${bf}`], playerId: "$me", type: "choose-destination" },
          title: `Choose where ${nameOf(a)} goes`,
          variants: [{ accept: false }, { pickedZoneId: "base" }, { pickedZoneId: `battlefield-${bf}` }],
        },
        {
          act: `clickModalButton:Play 4`,
          buttons: ["Counter a spell", "Play 4 1 Might Bird unit tokens with Deflect"],
          expectParams: { pickedMode: 1 },
          name: "choose-mode (label fallback from effect, no optionLabels)",
          pending: {
            effect: { options: [{ effect: { type: "counter" } }, { effect: { amount: 4, token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" } }], type: "choice" },
            options: [0, 1],
            playerId: "$me",
            sourceCardId: b,
            type: "choose-mode",
          },
          title: "Arena Kingpin — choose one",
          variants: [{ pickedMode: 0 }, { pickedMode: 1 }],
        },
        // ---- reveal-and-pick: every onPicked variant names its action on the card's own button ----
        {
          act: `clickModalButton:Don't recycle`,
          buttons: ["Recycle to bottom of your deck", "Don't recycle — leave the hand as it is"],
          cards: 2,
          expectParams: { accept: false },
          name: "reveal-and-pick optional recycle from hand",
          pending: { onPicked: "recycle", optional: true, prompter: "$me", revealed: hand.slice(0, 2), revealer: "$me", type: "reveal-and-pick" },
          title: "Your hand (2 cards): you may recycle 1 to the bottom of your deck",
          variants: [{ pickedCardId: hand[0] }, { pickedCardId: hand[1] }, { accept: false }],
        },
        {
          act: `clickModalButton:Recycle to bottom`,
          buttons: ["Recycle to bottom", "Keep it on top"],
          cards: 1,
          expectParams: { pickedCardId: deck[0] },
          name: "reveal-and-pick Vision (look at top card, may recycle; private)",
          pending: { onPicked: "recycle", optional: true, private: true, prompter: "$me", revealed: [deck[0]], revealer: "$me", sourceCardId: b, type: "reveal-and-pick" },
          title: "Arena Kingpin — Top card of your deck: keep it on top, or recycle it to the bottom?",
          variants: [{ pickedCardId: deck[0] }, { accept: false }],
        },
        {
          act: `clickModalButton:Keep all on top`,
          buttons: ["Select: Recycle to bottom", "Select cards to recycle (up to 2)", "Keep all on top (choose their order next)"],
          cards: 2,
          expectParams: { accept: false },
          name: "reveal-and-pick look at 2, recycle one or both (upTo → select + confirm)",
          pending: { onDecline: { amount: 2, type: "order-top" }, onPicked: "recycle", optional: true, private: true, prompter: "$me", remaining: 2, revealed: deck.slice(0, 2), revealer: "$me", sourceCardId: b, type: "reveal-and-pick", upTo: true },
          title: "Arena Kingpin — The top 2 cards of your Main Deck: recycle up to 2 to the bottom or keep them on top",
          variants: [{ pickedCardId: deck[0] }, { pickedCardId: deck[1] }, { accept: false }],
        },
        {
          act: `clickModalButton:Draw it`,
          buttons: ["Draw it"],
          cards: 3,
          expectParams: { pickedCardId: deck[0] },
          name: "reveal-and-pick look at 3, draw 1, recycle the rest (mandatory)",
          pending: { onPicked: "draw", onRest: "recycle", private: true, prompter: "$me", revealed: deck.slice(0, 3), revealer: "$me", sourceCardId: b, type: "reveal-and-pick" },
          title: "Arena Kingpin — The top 3 cards of your Main Deck: pick 1 to draw, the rest go to the bottom",
          variants: deck.slice(0, 3).map((id) => ({ pickedCardId: id })),
        },
        {
          act: `clickModalButton:Play it`,
          buttons: ["Play it — no energy cost", "Don't play anything"],
          expectParams: { pickedCardId: a },
          name: "reveal-and-pick play from the board/trash (optional, ignoring energy)",
          pending: { onPicked: "play", optional: true, playIgnoreEnergy: true, prompter: "$me", remaining: 1, revealed: [a], revealer: "$me", sourceCardId: b, type: "reveal-and-pick" },
          title: /^Arena Kingpin — .*you may play one/,
          variants: [{ pickedCardId: a }, { accept: false }],
        },
        {
          act: `clickModalButton:Banish it`,
          buttons: ["Banish it (returns when they hold)"],
          expectParams: { pickedCardId: foeHand[0] },
          name: "reveal-and-pick opponent reveals hand → banish (returnOnHold), one card filtered out",
          // Only the first card is offered; the second is shown dimmed with the filter's reason.
          pending: { filter: { excludeCardTypes: [game.state(foeHand[1] as string).cardType] }, onPicked: "banish", prompter: "$me", returnOnHold: true, revealed: foeHand.slice(0, 2), revealer: foeSeat, sourceCardId: b, type: "reveal-and-pick" },
          title: /^Arena Kingpin — Goldfish's hand \(2 cards\): banish 1$/,
          variants: [{ pickedCardId: foeHand[0] }],
        },
        {
          act: `rpMulti:${hand[0]},${hand[1]}`,
          buttons: ["Select: Discard it", "Select 2 to discard"],
          cards: 3,
          expectParams: { pickedCardIds: [hand[0], hand[1]] },
          name: "reveal-and-pick discard 2 (multi: select then confirm)",
          pending: { onPicked: "discard", prompter: "$me", remaining: 2, revealed: hand.slice(0, 3), revealer: "$me", sourceCardId: b, type: "reveal-and-pick" },
          title: "Arena Kingpin — Your hand (3 cards): discard 2",
          variants: hand.slice(0, 3).map((id) => ({ pickedCardId: id })),
        },
        {
          act: `clickModalButton:Yes`,
          buttons: ["Yes", "No"],
          expectParams: { accept: true },
          name: "opt-in with a Burn cost (rule 440.1) names the Burn and shows the asking card",
          pending: { playerId: "$me", resolved: { optInCost: { burn: 1 } }, sourceCardId: b, type: "opt-in" },
          title: "Use Arena Kingpin ability? (Burn 1)",
          variants: [{ accept: true }, { accept: false }],
        },
        {
          act: `filterThenClick:Zap:Zap`,
          buttons: ["Cleave", "Zap"],
          expectParams: { pickedName: "Zap" },
          name: "name-card (many names → filter box)",
          pending: { cardType: "spell", options: [], prompter: "$me", sourceCardId: b, type: "name-card" },
          title: "Name a spell for Arena Kingpin",
          variants: ["Cleave", "Block", "Zap", "Gust", "Rally", "Riptide", "Decisive Strike", "Flash", "Charm", "Confront", "En Garde", "Ride the Wind", "Rebuke"].map((n) => ({ pickedName: n })),
        },
        {
          act: `clickModalButton:Goldfish`,
          buttons: ["Tester", "Goldfish"],
          expectParams: { pickedPlayerId: P2 },
          name: "choose-player",
          pending: { effect: {}, options: [P1, P2], playerId: "$me", prompt: "Choose an opponent — they play a Gold token", type: "choose-player" },
          title: "Choose an opponent — they play a Gold token",
          variants: [{ pickedPlayerId: P1 }, { pickedPlayerId: P2 }],
        },
        {
          // rule 465.2.c — the ordered drag lane (combat-assign.test.ts covers reorder / Tank / advanced); here: titled,
          // one Confirm button naming the derived split, dispatching the exact enumerated allocation.
          act: `cdConfirm`,
          buttons: [`Confirm — ${nameOf(foe)} 3`],
          expectParams: { allocation: { [foe]: 3 } },
          name: "combat-damage",
          pending: { battlefieldId: bf, defaultAllocation: { [foe]: 3 }, lethalNeed: { [a]: 1, [foe]: 3 }, options: [foe, a], playerId: "$me", side: "attacker", tier: { [a]: 1, [foe]: 1 }, total: 3, type: "combat-damage" },
          title: `Assign 3 combat damage at ${bfName} (attacker)`,
          variants: [{ allocation: { [foe]: 3 } }, { allocation: { [a]: 1, [foe]: 2 } }],
        },
        {
          act: `clickModalButton:Don't equip`,
          buttons: ["Don't equip"],
          cards: 1,
          expectParams: { accept: false },
          name: "weaponmaster-equip",
          pending: { options: [b], playerId: "$me", type: "weaponmaster-equip", unitId: a },
          title: `Weaponmaster: equip ${nameOf(a)} for [rainbow] less?`,
          variants: [{ pickedCardId: b }, { accept: false }],
        },
        {
          act: `stepper:+,+,confirm`,
          buttons: ["−", "+", "Pay 0"],
          expectParams: { xAmount: 2 },
          name: "pay-x stepper",
          pending: { playerId: "$me", sourceCardId: b, type: "pay-x" },
          title: "Arena Kingpin — choose X",
          variants: [0, 1, 2, 3].map((x) => ({ xAmount: x })),
        },
        {
          act: `sequence:k2,k1,confirm`,
          buttons: [`${nameOf(a)} trigger`, `${nameOf(b)} trigger`, "Confirm order", "Keep listed order"],
          expectParams: { label: `${nameOf(b)} trigger → ${nameOf(a)} trigger`, orderedKeys: ["k2", "k1"] },
          name: "order (die-order title names the dying card)",
          pending: { items: [{ cardId: a, key: "k1", label: `${nameOf(a)} trigger` }, { cardId: b, key: "k2", label: `${nameOf(b)} trigger` }], playerId: "$me", prompt: "Order the replacement effects that apply to this death (first = applied first)", resume: { dyingCardId: a, kind: "die-order" }, sourceCardId: a, type: "order" },
          title: `${nameOf(a)}: Order the replacement effects that apply to this death (first = applied first)`,
          variants: [
            { label: `${nameOf(a)} trigger → ${nameOf(b)} trigger`, orderedKeys: ["k1", "k2"] },
            { label: `${nameOf(b)} trigger → ${nameOf(a)} trigger`, orderedKeys: ["k2", "k1"] },
          ],
        },
        {
          act: `sequence:${hand[1]},${hand[0]},confirm`,
          buttons: [nameOf(hand[0] as string), nameOf(hand[1] as string), "Confirm order"],
          expectParams: { orderedCardIds: [hand[1], hand[0]] },
          name: "order-cards (Predict: put back in any order)",
          pending: { cards: hand.slice(0, 2), prompter: "$me", sourceCardId: b, type: "order-cards" },
          title: "Arena Kingpin: Put the cards back in any order (first = top)",
          variants: [{ orderedCardIds: [hand[0], hand[1]] }, { orderedCardIds: [hand[1], hand[0]] }],
        },
        {
          act: `checks:${foe},confirm`,
          buttons: [`☐ ${nameOf(a)}`, `☐ ${nameOf(foe)}`, "Done (0)"],
          expectParams: { label: nameOf(foe), pickedKeys: [foe] },
          name: "pick-many (die-assign: which death does Zhonya's replace?)",
          pending: { max: 1, min: 1, options: [{ cardId: a, key: a }, { cardId: foe, key: foe }], playerId: "$me", prompt: "Choose which death this replacement effect applies to", resume: { kind: "die-assign", replacementId: "r1" }, semantics: "replacement-assign", sourceCardId: legend, type: "pick-many" },
          title: `${nameOf(legend)}: Choose which death this replacement effect applies to (1)`,
          variants: [{ label: nameOf(a), pickedKeys: [a] }, { label: nameOf(foe), pickedKeys: [foe] }],
        },
      ];

      const failures: string[] = [];
      for (const c of cases) {
        await ui.injectPending(page, c.pending, c.variants);
        const m = await ui.modal(page);
        const ctx = `${c.name}: ${JSON.stringify(m)}`;
        if (!m.visible || m.mode !== "pending") {
          failures.push(`[${c.name}] modal not visible`);
        }
        if (typeof c.title === "string" ? m.title !== c.title : !c.title.test(m.title)) {
          failures.push(`[${c.name}] title "${m.title}" ≠ "${String(c.title)}"`);
        }
        for (const want of c.buttons ?? []) {
          if (!m.buttons.some((x) => x === want || x.startsWith(want))) {
            failures.push(`[${c.name}] missing button "${want}" in ${JSON.stringify(m.buttons)}`);
          }
        }
        if (c.cards !== undefined && m.cards.length !== c.cards) {
          failures.push(`[${c.name}] ${m.cards.length} cards ≠ ${c.cards}`);
        }
        for (const l of [m.title, m.subtitle, ...m.buttons, ...m.cards.map((x) => x.label)]) {
          if (RAW_ID.test(l) || l === "—" || l === "-") {
            failures.push(`[${c.name}] raw/placeholder label "${l}"`);
          }
        }
        if (c.pending.type === "reveal-and-pick") {
          // Never "click card = mystery action": each eligible tile has a button naming the action, each
          // ineligible one says why + what happens to it, and there is a one-line instruction + visibility line.
          const rp = await page.evaluate<{ tiles: number; btns: string[]; no: string[]; instruction: string; seen: string; bareName: boolean }>(
            `(() => { const b = document.getElementById('choiceBox'); const names = Array.from(b.querySelectorAll('.rp-card-name')).map(e => e.textContent.trim()); const btns = Array.from(b.querySelectorAll('[data-rp-card]')).map(e => e.textContent.trim()); return { tiles: b.querySelectorAll('.rp-card[data-pick-idx]').length, btns, no: Array.from(b.querySelectorAll('[data-rp-ineligible]')).map(e => e.textContent.replace(/\s+/g, ' ').trim()), instruction: (b.querySelector('[data-rp-instruction]') || {}).textContent || '', seen: (b.querySelector('[data-rp-seen]') || {}).textContent || '', bareName: btns.some(t => names.includes(t)) }; })()`,
          );
          const verb = { banish: /Banish it/, discard: /Discard it/, draw: /Draw it/, play: /Play it/, recycle: /Recycle/ }[c.pending.onPicked as string] as RegExp;
          if (rp.tiles !== rp.btns.length || rp.tiles === 0 || !rp.btns.every((t) => verb.test(t)) || rp.bareName) {
            failures.push(`[${c.name}] card buttons ${JSON.stringify(rp)}`);
          }
          if (!/Click /.test(rp.instruction) || !rp.seen || (c.pending.private ? !/privately/.test(rp.seen) : c.pending.revealer === foeSeat ? !/Goldfish revealed/.test(rp.seen) : false)) {
            failures.push(`[${c.name}] instruction/seen ${JSON.stringify(rp)}`);
          }
          if (c.pending.filter && (rp.no.length === 0 || !rp.no.every((t) => /^Can't pick — /.test(t)))) {
            failures.push(`[${c.name}] ineligible captions ${JSON.stringify(rp.no)}`);
          }
        }
        if (c.pending.type === "opt-in" && (c.pending.resolved as { optInCost?: { burn?: number } } | undefined)?.optInCost?.burn) {
          const oi = await page.evaluate<{ source: string; cost: string; subtitle: string }>(
            `({ source: (document.querySelector('#choiceOverlay [data-prompt-source] .prompt-source-name') || {}).textContent || '', cost: (document.querySelector('#choiceOverlay [data-optin-cost]') || {}).textContent || '', subtitle: (document.querySelector('#choiceOverlay .chain-subtitle') || {}).textContent || '' })`,
          );
          if (oi.source !== nameOf(b) || !/Burn 1 — put the top card of your deck into your trash/.test(oi.cost) || !/Burn 1/.test(oi.subtitle)) {
            failures.push(`[${c.name}] burn cost ${JSON.stringify(oi)}`);
          }
        }
        // Sidebar mirrors the prompt title (and never leaks raw ids / "(N options)").
        const side = await ui.actionButtons(page);
        const sideTitle = await page.evaluate<string>(`(document.querySelector('#actionsList [data-pending-type]') || {}).textContent || ""`);
        if (!sideTitle.includes(typeof c.title === "string" ? c.title.slice(0, 20) : "")) {
          failures.push(`[${c.name}] sidebar title "${sideTitle.trim()}"`);
        }
        for (const sb of side) {
          if (RAW_ID.test(sb.text) || /\(\d+ options\)$/.test(sb.text)) {
            failures.push(`[${c.name}] sidebar raw "${sb.text}"`);
          }
        }
        const got = await ui.capture(page, async () => {
          const [kind, ...rest] = c.act.split(":");
          const arg = rest.join(":");
          if (kind === "clickModalButton") {
            if (!(await ui.clickModalButton(page, arg))) {
              failures.push(`[${c.name}] no modal button "${arg}"`);
            }
          } else if (kind === "cdConfirm") {
            await page.evaluate(`document.querySelector('#choiceOverlay [data-cd-confirm]').click()`);
          } else if (kind === "clickCard") {
            await page.evaluate(`document.querySelector('#choiceOverlay .choice-modal-card[data-card-id="${arg}"]').click()`);
          } else if (kind === "filterThenClick") {
            const [q, btn] = arg.split(":");
            await page.evaluate(`(() => { const f = document.querySelector('#choiceOverlay .choice-modal-filter'); f.value = ${JSON.stringify(q)}; f.dispatchEvent(new Event('input')); })()`);
            const visibleBtns = await page.evaluate<string[]>(`Array.from(document.querySelectorAll('#choiceOverlay .choice-modal-btn[data-other-idx]')).filter(b => b.style.display !== 'none').map(b => b.textContent.trim())`);
            if (visibleBtns.join("|") !== btn) {
              failures.push(`[${c.name}] filter left ${JSON.stringify(visibleBtns)}`);
            }
            await ui.clickModalButton(page, btn as string);
          } else if (kind === "stepper") {
            for (const step of arg.split(",")) {
              await page.evaluate(step === "confirm" ? `document.querySelector('#choiceOverlay [data-compose-confirm]').click()` : `document.querySelector('#choiceOverlay [data-x-step="${step === "+" ? 1 : -1}"]').click()`);
            }
          } else if (kind === "sequence") {
            for (const step of arg.split(",")) {
              await page.evaluate(step === "confirm" ? `document.querySelector('#choiceOverlay [data-compose-confirm]').click()` : `document.querySelector('#choiceOverlay [data-seq-key="${step}"]').click()`);
            }
          } else if (kind === "checks") {
            for (const step of arg.split(",")) {
              await page.evaluate(step === "confirm" ? `document.querySelector('#choiceOverlay [data-compose-confirm]').click()` : `document.querySelector('#choiceOverlay [data-check-key="${step}"]').click()`);
            }
          } else if (kind === "rpMulti") {
            // reveal-and-pick multi: each card's own button toggles it, the confirm names picked vs unpicked.
            const want = arg.split(",");
            for (const id of want) {
              await page.evaluate(`document.querySelector('#choiceOverlay [data-rp-card="${id}"]').click()`);
            }
            const state = await page.evaluate<{ picked: string[]; confirm: string; disabled: boolean }>(
              `({ picked: Array.from(document.querySelectorAll('#choiceOverlay .rp-card.rp-picked')).map(e => e.dataset.cardId), confirm: document.querySelector('#choiceOverlay [data-rp-confirm]').textContent.trim(), disabled: document.querySelector('#choiceOverlay [data-rp-confirm]').disabled })`,
            );
            if (state.picked.join("|") !== want.join("|") || state.disabled || !/^Discard 2 picked · 1 other stay/.test(state.confirm)) {
              failures.push(`[${c.name}] selection ${JSON.stringify(state)}`);
            }
            await page.evaluate(`document.querySelector('#choiceOverlay [data-rp-confirm]').click()`);
          }
        });
        const sent = got[0];
        if (!sent || sent.moveId !== "resolvePendingChoice") {
          failures.push(`[${c.name}] nothing dispatched (${ctx})`);
        } else {
          const { playerId: _p, ...params } = sent.params;
          void _p;
          if (canon(params) !== canon(c.expectParams)) {
            failures.push(`[${c.name}] dispatched ${JSON.stringify(params)} ≠ ${JSON.stringify(c.expectParams)}`);
          }
          if (sent.params.playerId !== P1) {
            failures.push(`[${c.name}] playerId ${String(sent.params.playerId)}`);
          }
        }
        await ui.resync(backend);
      }

      // rule 383.3.d soft trigger-order (DESIGN.md §Trigger ordering): a compact sidebar HINT (not a modal) pointing at
      // the draggable stack popup over the board; other moves stay listed; the popup lists the triggers top-of-chain first.
      await ui.injectPending(page, null as unknown as Record<string, unknown>, [{ label: "A → B", orderedKeys: ["x", "y"] }, { label: "B → A", orderedKeys: ["y", "x"] }], {
        __keepMoves: true,
        pendingTriggerOrder: { defaultable: true, items: [{ cardId: a, key: "x", label: "A" }, { cardId: b, key: "y", label: "B" }], playerId: P1, prompt: "Order your simultaneous triggers on the Chain", resume: { itemIds: ["x", "y"], kind: "trigger-batch" }, type: "order" },
      });
      const soft = await page.evaluate<{ panel: string; picks: string[]; open: string[]; endTurn: boolean; modal: boolean; rows: string[] }>(
        `(() => ({ panel: (document.querySelector('#actionsList [data-trigger-order]') || {}).textContent || "", picks: Array.from(document.querySelectorAll('#actionsList [data-trigger-order-pick]')).map(b => b.textContent.trim()), open: Array.from(document.querySelectorAll('#actionsList [data-trigger-order-open]')).map(b => b.textContent.trim()), endTurn: Array.from(document.querySelectorAll('#actionsList .action-btn')).some(b => b.textContent.trim() === 'End Turn'), modal: !!document.querySelector('#choiceOverlay.visible'), rows: Array.from(document.querySelectorAll('#triggerOrderPopup [data-trigger-row]')).map(r => r.getAttribute('data-trigger-row')) }))()`,
      );
      if (!/Order your simultaneous triggers/.test(soft.panel) || !/optional/.test(soft.panel)) {
        failures.push(`[trigger-order] panel "${soft.panel.trim()}"`);
      }
      if (soft.picks.join("|") !== "Keep this order" || soft.open.length !== 1 || !/Reorder 2 triggers/.test(soft.open[0] ?? "") || !soft.endTurn || soft.modal || soft.rows.join("|") !== "y|x") {
        failures.push(`[trigger-order] ${JSON.stringify(soft)}`);
      }
      await ui.resync(backend);
      if (await page.evaluate<boolean>(`!!document.getElementById('triggerOrderPopup')`)) {
        failures.push("[trigger-order] popup still shown after the offer is gone");
      }

      // Zoom never sits above a prompt: open zoom, then a prompt arrives → zoom closes, modal on top.
      await page.evaluate(`openZoom(${JSON.stringify(a)})`);
      expect(await page.evaluate<boolean>(`document.getElementById('cardZoom').classList.contains('visible')`)).toBe(true);
      await ui.injectPending(page, { playerId: "$me", sourceCardId: b, type: "confirm", prompt: "Go?" , effect: {} }, [{ accept: true }, { accept: false }]);
      const z = await page.evaluate<{ zoom: boolean; modal: boolean }>(`({ zoom: document.getElementById('cardZoom').classList.contains('visible'), modal: !!document.querySelector('#choiceOverlay.visible') })`);
      if (z.zoom || !z.modal) {
        failures.push(`[zoom-under-modal] ${JSON.stringify(z)}`);
      }
      await ui.resync(backend);

      expect(failures).toEqual([]);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT * 2,
  );

  // DESIGN.md §Trigger ordering — rule 383.3.d stays SOFT but gets a real UI: an in-board, draggable STACK POPUP
  // listing the controller's N pending triggers top-of-chain first (resolution numbers live), reorderable by
  // drag-and-drop or ↑/↓, "Confirm order" → resolvePendingChoice{orderedKeys} (engine order = bottom first =
  // REVERSE of the display), "Use default" → the listed scan order. Non-blocking: no modal, hand still clickable.
  test(
    "trigger-order stack popup: N rows top-of-chain-first with live numbers, ↑/↓ + drag reorder, Confirm dispatches the reversed display as orderedKeys, Use default sends the listed order, no modal / board not covered, gone with the offer",
    async () => {
      live = await launchTest(BASE_URL);
      const { backend, game } = live;
      const page = backend.page;
      await ui.prepare(page);
      const a = await fieldUnit(live, "sfd-018-221");
      const b = await fieldUnit(live, "unl-001-219");
      const legend = game.p1.legend() as string;
      const items = [
        { cardId: a, key: "k1", label: "Alpha trigger" },
        { cardId: b, key: "k2", label: "Beta trigger" },
        { cardId: legend, key: "k3", label: "Gamma trigger" },
      ];
      // 3 items → the engine enumerates all 6 permutations (labelled); the popup must send the exact one.
      const perms = [["k1", "k2", "k3"], ["k1", "k3", "k2"], ["k2", "k1", "k3"], ["k2", "k3", "k1"], ["k3", "k1", "k2"], ["k3", "k2", "k1"]];
      const labelOf = (k: string) => items.find((i) => i.key === k)?.label ?? k;
      const variants = perms.map((orderedKeys) => ({ label: orderedKeys.map(labelOf).join(" → "), orderedKeys }));
      const inject = () =>
        ui.injectPending(page, null as unknown as Record<string, unknown>, variants, {
          __keepMoves: true,
          pendingTriggerOrder: { defaultable: true, items, playerId: P1, prompt: "Order your simultaneous triggers on the Chain (first = bottom, last = top → resolves first)", resume: { itemIds: ["k1", "k2", "k3"], kind: "trigger-batch" }, type: "order" },
        });
      const snapshot = () =>
        page.evaluate<{ exists: boolean; rows: string[]; nums: string[]; labels: string[]; title: string; hint: string; modal: boolean; buttons: string[]; box: { left: number; top: number; width: number; height: number } | null; hand: { top: number } | null; vw: number; vh: number }>(
          `(() => { const p = document.getElementById('triggerOrderPopup'); const r = p ? p.getBoundingClientRect() : null; const h = document.getElementById('player-hand'); const hr = h ? h.getBoundingClientRect() : null; return {
            exists: !!p,
            rows: p ? Array.from(p.querySelectorAll('[data-trigger-row]')).map(x => x.getAttribute('data-trigger-row')) : [],
            nums: p ? Array.from(p.querySelectorAll('[data-trigger-num]')).map(x => x.textContent.trim()) : [],
            labels: p ? Array.from(p.querySelectorAll('[data-trigger-row] .top-label')).map(x => x.firstChild ? x.firstChild.textContent.trim() : '') : [],
            title: p ? (p.querySelector('.top-title') || {}).textContent || '' : '',
            hint: p ? (p.querySelector('.top-hint') || {}).textContent || '' : '',
            modal: !!document.querySelector('#choiceOverlay.visible'),
            buttons: p ? Array.from(p.querySelectorAll('.top-btn')).map(x => x.textContent.trim()) : [],
            box: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
            hand: hr ? { top: hr.top } : null,
            vw: window.innerWidth, vh: window.innerHeight }; })()`,
        );

      await inject();
      let s = await snapshot();
      expect(s.exists).toBe(true);
      expect(s.modal).toBe(false);
      // Listed (scan) order is bottom→top, so the display (top of chain first) is its reverse.
      expect(s.rows).toEqual(["k3", "k2", "k1"]);
      expect(s.nums).toEqual(["1", "2", "3"]);
      expect(s.labels).toEqual(["Gamma trigger", "Beta trigger", "Alpha trigger"]);
      expect(s.title).toMatch(/3 triggers/);
      expect(s.hint).toMatch(/Top of chain resolves first/);
      expect(s.buttons).toEqual(["Confirm order", "Use default"]);
      expectHuman([s.title, s.hint, ...s.labels, ...s.buttons], "trigger-order popup");
      // Non-blocking: a compact box (well under half the viewport) that leaves the hand row uncovered.
      expect(s.box).not.toBeNull();
      expect((s.box?.width ?? 9999) <= 360 && (s.box?.height ?? 9999) < s.vh * 0.7).toBe(true);
      expect(await page.evaluate<boolean>(`Array.from(document.querySelectorAll('#actionsList .action-btn')).some(b => b.textContent.trim() === 'End Turn')`)).toBe(true);

      // ↑ on the last row (k1) twice → k1 on top: display k1,k3,k2 ; numbers re-computed live.
      await page.evaluate(`document.querySelector('#triggerOrderPopup [data-trigger-up="k1"]').click()`);
      await page.evaluate(`document.querySelector('#triggerOrderPopup [data-trigger-up="k1"]').click()`);
      s = await snapshot();
      expect(s.rows).toEqual(["k1", "k3", "k2"]);
      expect(s.nums).toEqual(["1", "2", "3"]);
      // HTML5 drag-and-drop: drop k2 BEFORE k1 (synthetic DragEvents; dataTransfer may be null → the popup keeps its own drag key).
      await page.evaluate(`(() => {
        const src = document.querySelector('#triggerOrderPopup [data-trigger-row="k2"]');
        const dst = document.querySelector('#triggerOrderPopup [data-trigger-row="k1"]');
        const mk = (type, y) => { let ev; try { ev = new DragEvent(type, { bubbles: true, cancelable: true, clientY: y }); } catch (e) { ev = new Event(type, { bubbles: true, cancelable: true }); ev.clientY = y; } return ev; };
        const r = dst.getBoundingClientRect();
        src.dispatchEvent(mk('dragstart', 0));
        dst.dispatchEvent(mk('dragover', r.top + 2));
        dst.dispatchEvent(mk('drop', r.top + 2));
        src.dispatchEvent(mk('dragend', 0));
      })()`);
      s = await snapshot();
      expect(s.rows).toEqual(["k2", "k1", "k3"]);

      // Confirm → the engine order is bottom-first = reverse of the display: k3, k1, k2 (exact enumerated variant, label included).
      let got = await ui.capture(page, async () => {
        await page.evaluate(`document.querySelector('#triggerOrderPopup [data-trigger-order-confirm]').click()`);
      });
      expect(got).toHaveLength(1);
      expect(got[0]?.moveId).toBe("resolvePendingChoice");
      expect(canon((({ playerId: _p, ...rest }) => rest)(got[0]?.params as Record<string, unknown> & { playerId?: string }))).toBe(
        canon({ label: ["k3", "k1", "k2"].map(labelOf).join(" → "), orderedKeys: ["k3", "k1", "k2"] }),
      );
      expect(got[0]?.params.playerId).toBe(P1);

      // Use default → the listed scan order verbatim; the sidebar "Keep this order" hint does the same.
      await inject();
      got = await ui.capture(page, async () => {
        await page.evaluate(`document.querySelector('#triggerOrderPopup [data-trigger-order-default]').click()`);
      });
      expect(canon((({ playerId: _p, ...rest }) => rest)(got[0]?.params as Record<string, unknown> & { playerId?: string }))).toBe(
        canon({ label: ["k1", "k2", "k3"].map(labelOf).join(" → "), orderedKeys: ["k1", "k2", "k3"] }),
      );
      got = await ui.capture(page, async () => {
        await page.evaluate(`document.querySelector('#actionsList [data-trigger-order-pick]').click()`);
      });
      expect(got[0]?.params.orderedKeys).toEqual(["k1", "k2", "k3"]);

      // The offer disappears (any other action / a fresh sync) → the popup is removed at once.
      await ui.resync(backend);
      expect(await page.evaluate<boolean>(`!!document.getElementById('triggerOrderPopup')`)).toBe(false);
      // Not ours → never shown.
      await ui.injectPending(page, null as unknown as Record<string, unknown>, [], {
        __keepMoves: true,
        pendingTriggerOrder: { defaultable: true, items, playerId: P2, prompt: "Order", resume: { itemIds: ["k1", "k2", "k3"], kind: "trigger-batch" }, type: "order" },
      });
      expect(await page.evaluate<boolean>(`!!document.getElementById('triggerOrderPopup')`)).toBe(false);
      await ui.resync(backend);
      expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
    },
    LIVE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Layout invariants (DESIGN.md §Board layout) at both reference viewports.
// ---------------------------------------------------------------------------

for (const vp of [
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
]) {
  describeLive(`layout invariants @${vp.width}x${vp.height}`, () => {
    test(
      "legend/champion never under the rune pool; rune piles (ours 8 runes, theirs) fully inside their grids; expanded action groups not clipped; exhausted cards rotated+dimmed in base and at a battlefield; VP badge = effective victory score",
      async () => {
        live = await launchTest(BASE_URL, vp);
        const { backend, game } = live;
        const page = backend.page;
        await ui.prepare(page);
        const p1 = game.p1;

        // Get to turn 7 (8 runes each side), then put an exhausted unit at a battlefield (fresh move) and one in base.
        await cycleTurn(live);
        await cycleTurn(live);
        await cycleTurn(live);
        expect(game.turnNumber()).toBeGreaterThanOrEqual(7);
        expect(p1.runes().length).toBeGreaterThanOrEqual(8);
        const mover = await fieldUnit(live, "unl-001-219"); // enters ready
        await p1.move(mover, game.battlefields()[0] as string);
        await game.settle();
        const sitter = await fieldUnit(live, "sfd-018-221"); // enters exhausted in base
        await p1.tapRune();
        await backend.refresh();
        await page.evaluate(`render()`);
        await backend.screenshot(`/tmp/rb-affordance-layout-${vp.width}x${vp.height}.png`).catch(() => undefined);

        // 1. Legend/Champion boxes never intersect the rune pool (both players).
        expect(await ui.overlaps(page, "#player-legendChampion", "#player-runePool")).toBe(false);
        expect(await ui.overlaps(page, "#opponent-legendChampion", "#opponent-runePool")).toBe(false);
        expect(await ui.overlaps(page, "#player-legendChampion", "#resourceBar")).toBe(false);
        for (const id of [p1.legend(), p1.champion(), game.p2.legend()].filter(Boolean) as string[]) {
          const hp = await ui.hitPoint(page, id);
          expect({ id, occludedBy: hp?.occludedBy ?? null }).toEqual({ id, occludedBy: null });
        }
        // 2. Every rune card (and its label) lies fully inside its clipped grid; every rune is hittable.
        expect(await ui.clippedElements(page, "#player-runePool .card, #player-runePool .rune-stack-label")).toEqual([]);
        expect(await ui.clippedElements(page, "#opponent-runePool .card, #opponent-runePool .rune-stack-label")).toEqual([]);
        for (const r of p1.runes()) {
          const hp = await ui.hitPoint(page, r);
          expect({ occludedBy: hp?.occludedBy ?? null, rune: r }).toEqual({ occludedBy: null, rune: r });
        }
        // Player rune cards keep (about) hand-card size (DESIGN: ~110×154 logical → ≥ 70px wide on screen at 0.75 scale).
        const runeW = await page.evaluate<number>(`document.querySelector('#player-runePool .card:not(.exhausted)')?.getBoundingClientRect().width || 0`);
        expect(runeW).toBeGreaterThan(70);
        // 3. Expanded action groups are never clipped by the panel (it scrolls them into view / grows).
        for (const g of ["exhaustRune", "recycleRune"]) {
          await ui.expandGroup(page, g);
          await page.waitForTimeout(300);
          expect(await ui.clippedElements(page, `#move-group-${g} .action-btn`)).toEqual([]);
        }
        // 4. Exhausted board cards render rotated (transform matrix with a 90° component) + overlay class, in base AND at a battlefield.
        const ex = await page.evaluate<{ id: string; zone: string; rotated: boolean; dimmed: boolean }[]>(`Array.from(document.querySelectorAll('#player-base .card.card--exhausted, #battlefieldRow .battlefield .card.card--exhausted')).map(el => { const t = getComputedStyle(el).transform; const m = /matrix\\(([^)]+)\\)/.exec(t); const parts = m ? m[1].split(',').map(Number) : []; return { id: el.dataset.cardId, zone: el.dataset.zone, rotated: parts.length >= 4 && Math.abs(parts[0]) < 0.05 && Math.abs(parts[1]) > 0.5, dimmed: getComputedStyle(el, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)' }; })`);
        expect(ex.find((e) => e.id === sitter)).toMatchObject({ dimmed: true, rotated: true, zone: "base" });
        if (game.state(mover).isExhausted && game.zoneOf(mover).startsWith("battlefield")) {
          expect(ex.find((e) => e.id === mover)).toMatchObject({ dimmed: true, rotated: true });
        }
        // Battlefield unit rows show whole cards (no slivers): the unit at the battlefield is not clipped by its row.
        expect(await ui.clippedElements(page, `#battlefieldRow .battlefield [data-card-id="${mover}"]`)).toEqual([]);
        // 5. VP badge denominator is the engine's effective victory score (battlefield bonuses included).
        const eff = (backend.currentFrame.snapshot as unknown as { victoryScoreEffective?: Record<string, number> }).victoryScoreEffective?.[P1];
        expect(typeof eff).toBe("number");
        expect(await page.evaluate<string>(`document.querySelector('#playerInfo .stat-value.vp').textContent.trim()`)).toBe(`${p1.points()} / ${eff}`);
        expect(backend.pageErrors.filter((e) => !/favicon|card-image/.test(e))).toEqual([]);
      },
      LIVE_TIMEOUT * 2,
    );
  });
}
