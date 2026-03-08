#!/usr/bin/env node
/**
 * Sync MCP config from mcp.canonical.json to all agent-specific locations.
 * Run: node scripts/sync-mcp-config.mjs
 *
 * Setup: Copy mcp.canonical.example.json to mcp.canonical.json and add your
 * API keys. mcp.canonical.json is gitignored (contains secrets).
 *
 * Targets:
 *   - .mcp.json          (Claude Code)
 *   - .cursor/mcp.json   (Cursor)
 *   - .gemini/settings.json (Gemini CLI)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CANONICAL = join(ROOT, "mcp.canonical.json");

function loadCanonical() {
  try {
    const raw = readFileSync(CANONICAL, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(
        "mcp.canonical.json not found. Copy mcp.canonical.example.json to mcp.canonical.json and add your API keys."
      );
    }
    throw err;
  }
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

// Claude Code & Cursor: mcpServers with url
function buildClaudeCursorConfig(canon) {
  const mcpServers = {};
  for (const [name, server] of Object.entries(canon.servers)) {
    mcpServers[name] = {
      type: "http",
      url: server.url,
      headers: server.headers,
    };
  }
  return { mcpServers };
}

// Gemini: mcpServers with serverUrl, stitchProjectId at root
function buildGeminiConfig(canon) {
  const mcpServers = {};
  for (const [name, server] of Object.entries(canon.servers)) {
    mcpServers[name] = {
      serverUrl: server.url,
      headers: server.headers,
    };
  }
  const out = { mcpServers };
  if (canon.stitchProjectId) {
    out.stitchProjectId = canon.stitchProjectId;
  }
  return out;
}

function main() {
  const canon = loadCanonical();

  const claudeCursor = buildClaudeCursorConfig(canon);
  const gemini = buildGeminiConfig(canon);

  // .mcp.json (Claude Code)
  const mcpJson = join(ROOT, ".mcp.json");
  writeFileSync(mcpJson, JSON.stringify(claudeCursor, null, 2) + "\n");

  // .cursor/mcp.json (Cursor)
  const cursorMcp = join(ROOT, ".cursor", "mcp.json");
  ensureDir(cursorMcp);
  writeFileSync(cursorMcp, JSON.stringify(claudeCursor, null, 2) + "\n");

  // .gemini/settings.json (Gemini)
  const geminiSettings = join(ROOT, ".gemini", "settings.json");
  ensureDir(geminiSettings);
  writeFileSync(geminiSettings, JSON.stringify(gemini, null, 2) + "\n");

  console.log("MCP config synced:");
  console.log("  - .mcp.json (Claude Code)");
  console.log("  - .cursor/mcp.json (Cursor)");
  console.log("  - .gemini/settings.json (Gemini)");
}

main();
