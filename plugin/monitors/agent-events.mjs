#!/usr/bin/env node

// plugin/src/agent-events.ts
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

// packages/contract/src/generated.ts
var STREAMS = {
  agentEvents: {
    path: "/api/agent-events",
    refusals: ["UNAUTHORIZED", "INVALID_EVENT_CODE", "EVENT_CODE_REVOKED", "EVENT_CODE_NOT_BOUND"],
    events: ["test"]
  }
};

// plugin/src/agent-events.ts
var RECONNECT_DELAY_MS = 2e3;
var UNCONFIGURED_URL = "https://unconfigured.invalid/api/agent-events";
var EVENT_TYPES = new Set(STREAMS.agentEvents.events);
var REFUSALS = new Set(STREAMS.agentEvents.refusals);
var NEEDS_NEW_CODE = /* @__PURE__ */ new Set(["EVENT_CODE_REVOKED", "INVALID_EVENT_CODE"]);
function say(line) {
  process.stdout.write(`${line}
`);
}
function drawCode() {
  const code2 = randomBytes(32).toString("base64url");
  say(`polly event code: ${code2}. Bind it with the start_lesson tool of the polly MCP server.`);
  return code2;
}
function fieldOf(data) {
  return JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}
async function listen(url2, code2) {
  const response = await fetch(url2, { headers: { authorization: `Bearer ${code2}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return typeof body.code === "string" && REFUSALS.has(body.code) ? body.code : void 0;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body ?? []) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (event === void 0 || data === void 0) {
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (event === "error" && typeof parsed.code === "string" && REFUSALS.has(parsed.code)) {
        return parsed.code;
      }
      if (typeof parsed.type === "string" && EVENT_TYPES.has(parsed.type)) {
        say(
          `polly event ${parsed.type}, handle it with the polly:lesson skill. <polly-event-data>${fieldOf(parsed)}</polly-event-data>`
        );
      }
    }
  }
  return void 0;
}
var code = drawCode();
var configured = process.env["POLLY_EVENTS_URL"];
if (configured === void 0 || configured === "") {
  say("WORKTREE_NOT_CONFIGURED: run nr dev:up, then restart the session with nr agent");
}
var url = configured || UNCONFIGURED_URL;
for (; ; ) {
  let ending;
  try {
    ending = await listen(url, code);
  } catch {
    ending = void 0;
  }
  if (ending !== void 0 && NEEDS_NEW_CODE.has(ending)) {
    code = drawCode();
    continue;
  }
  await sleep(RECONNECT_DELAY_MS);
}
