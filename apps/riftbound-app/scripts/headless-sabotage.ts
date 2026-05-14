#!/usr/bin/env bun
/**
 * Headless Sabotage screenshot deck.
 *
 * Drives the SPA through four frames of the Sabotage cast flow and writes
 * one JPEG per frame.
 *
 *   1. /tmp/sabotage-1-precast.jpg       — Sabotage visible in P1's hand.
 *   2. /tmp/sabotage-2-targetpicker.jpg  — TargetPicker / "choose target"
 *                                          modal open after clicking
 *                                          Sabotage's hand chip.
 *   3. /tmp/sabotage-3-handrevealed.jpg  — Opponent's hand face-up while
 *                                          a pendingChoice is active.
 *   4. /tmp/sabotage-4-resolved.jpg      — Post-resolution: target card
 *                                          recycled, pendingChoice clear,
 *                                          opponent hand size − 1.
 *
 * Each frame is seeded by POSTing to /api/v2/scenario/sabotage/<sid> with
 * a different `step` parameter (precast | revealed | resolved). Frame 2
 * uses the precast seed and then drives a UI click on the Sabotage hand
 * chip to open the TargetPicker.
 */
import puppeteer from "puppeteer-core";

const ORIGIN = process.env.SABOTAGE_ORIGIN ?? "http://localhost:3000";
const SESSION_PREFIX = `sabotage-shot-${Date.now()}`;
const VIEWPORT = { height: 1400, width: 1400 } as const;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FRAMES = [
  {
    clickHandChip: false,
    file: "/tmp/sabotage-1-precast.jpg",
    label: "1-precast",
    step: "precast" as const,
  },
  {
    clickHandChip: true,
    file: "/tmp/sabotage-2-targetpicker.jpg",
    label: "2-targetpicker",
    step: "precast" as const,
  },
  {
    clickHandChip: false,
    file: "/tmp/sabotage-3-handrevealed.jpg",
    label: "3-handrevealed",
    step: "revealed" as const,
  },
  {
    clickHandChip: false,
    file: "/tmp/sabotage-4-resolved.jpg",
    label: "4-resolved",
    step: "resolved" as const,
  },
] as const;

async function seedScenario(sessionId: string, step: string): Promise<void> {
  const url = `${ORIGIN}/api/v2/scenario/sabotage/${encodeURIComponent(sessionId)}`;
  const r = await fetch(url, {
    body: JSON.stringify({ playerId: "player-1", step }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {
    throw new Error(`seed ${step} failed: HTTP ${r.status}`);
  }
  const body = (await r.json()) as { ok?: boolean; seed?: { seeded?: boolean } };
  if (!body.ok || !body.seed?.seeded) {
    throw new Error(`seed ${step} reported not-seeded: ${JSON.stringify(body)}`);
  }
}

const browser = await puppeteer.launch({
  defaultViewport: VIEWPORT,
  executablePath: CHROME_PATH,
  headless: true,
});

try {
  for (const frame of FRAMES) {
    const sessionId = `${SESSION_PREFIX}-${frame.label}`;
    await seedScenario(sessionId, frame.step);

    const page = await browser.newPage();
    page.on("console", (m) => console.error(`[${frame.label} console]`, m.type(), m.text()));
    page.on("pageerror", (e) => console.error(`[${frame.label} pageerror]`, e.message));

    const url = `${ORIGIN}/play/?session=${encodeURIComponent(sessionId)}&realDecks=true`;
    await page.goto(url, { timeout: 20_000, waitUntil: "networkidle2" });
    // Give React + card art a beat to settle.
    await new Promise((r) => setTimeout(r, 1500));

    if (frame.clickHandChip) {
      // Find the Sabotage hand chip (the instance id is stable per seed).
      const handChipSelector = "[data-testid=\"hand-chip-sabotage-demo-player-1\"]";
      const exists = await page.$(handChipSelector);
      if (!exists) {
        console.error(`[${frame.label}] hand chip not found, dumping a debug snapshot anyway`);
      } else {
        await page.click(handChipSelector);
        // Wait for the TargetPicker modal to appear.
        await page
          .waitForSelector("[data-testid=\"target-picker\"]", { timeout: 3000 })
          .catch((error) => console.error(`[${frame.label}] target-picker selector wait failed:`, (error as Error).message));
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    await page.screenshot({
      fullPage: true,
      path: frame.file,
      quality: 80,
      type: "jpeg",
    });
    console.log(`[ok] wrote ${frame.file}`);
    await page.close();
  }
} catch (error) {
  console.error("[err]", (error as Error).message);
  process.exit(1);
} finally {
  await browser.close();
}
