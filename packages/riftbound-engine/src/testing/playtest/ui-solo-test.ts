#!/usr/bin/env bun
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("/tmp/solo-shots", { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on("console", m => console.log("[page]", m.type(), m.text()));

await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await p.fill("#loginUser", "dev@riftbound.local");
await p.fill("#loginPass", "dev");
await p.click("#loginBtn");
await p.waitForTimeout(800);
await p.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.removeItem("rb_session"); localStorage.removeItem("rb_lobby"); sessionStorage.clear(); });
await p.goto("http://localhost:3000/play", { waitUntil: "networkidle" });
await p.screenshot({ path: "/tmp/solo-shots/00-menu.png" });

// 4-mode grid check
const modes = await p.evaluate(() => [...document.querySelectorAll('.mode-card .mode-card-title')].map(e=>e.textContent));
console.log("modes:", modes);

// Click Goldfish → deck picker (no lobby)
await p.click('.mode-card:has-text("Goldfish")');
await p.waitForTimeout(400);
const pickerVisible = await p.evaluate(() => !document.getElementById("soloDeckPicker")?.classList.contains("hidden"));
const lobbyRoomHidden = await p.evaluate(() => document.getElementById("lobbyRoom")?.classList.contains("hidden"));
console.log("soloDeckPicker visible:", pickerVisible, "lobbyRoom hidden:", lobbyRoomHidden);
await p.screenshot({ path: "/tmp/solo-shots/01-solo-picker.png" });

// Select deck 1 and Play
await p.selectOption('#soloDeckSelect', { index: 1 }).catch(()=>{});
await p.click('button:has-text("Play")');
await p.waitForTimeout(3000);
const state = await p.evaluate(() => ({
  gs: !!(window as any).__rbGameState,
  turn: (window as any).__rbGameState?.turn,
  status: (window as any).__rbGameState?.status,
  coinVisible: document.getElementById("coinOverlay")?.classList.contains("visible"),
  pregameVisible: document.getElementById("pregameOverlay")?.classList.contains("visible"),
  handCards: document.querySelectorAll('#player-hand .card, .mulligan-hand .card').length,
}));
console.log("after Play:", state);
await p.screenshot({ path: "/tmp/solo-shots/02-after-play.png" });

// Keep mulligan → board
const keep = await p.$('.mulligan-btn-keep, button:has-text("Keep")');
if (keep) { await keep.click(); await p.waitForTimeout(1500); }
await p.screenshot({ path: "/tmp/solo-shots/03-board.png" });
const boardState = await p.evaluate(() => ({
  turn: (window as any).__rbGameState?.turn,
  moves: ((window as any).__rbAvailableMoves||[]).length,
}));
console.log("board:", boardState);

await b.close();
console.log("done");
