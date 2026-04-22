const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { URL } = require("url");

const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const ENGINE_SRC = path.join(__dirname, "scheduler.cpp");
const ENGINE_BIN = path.join(
  __dirname,
  process.platform === "win32" ? "scheduler.exe" : "scheduler"
);
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function escapeField(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\p")
    .replace(/,/g, "\\c")
    .replace(/\n/g, " ");
}

function buildEngineInput(payload) {
  const satellites = Array.isArray(payload.satellites) ? payload.satellites : [];
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  const lines = [];
  lines.push(`SATELLITES ${satellites.length}`);
  satellites.forEach((sat) => {
    const regions = Array.isArray(sat.coverableRegions) ? sat.coverableRegions : [];
    lines.push(
      [
        escapeField(sat.id),
        escapeField(sat.name),
        escapeField(sat.maxTasksPerOrbit),
        regions.map(escapeField).join(","),
      ].join("|")
    );
  });

  lines.push(`TASKS ${tasks.length}`);
  tasks.forEach((task) => {
    lines.push(
      [
        escapeField(task.id),
        escapeField(task.region),
        escapeField(task.pollutionType),
        escapeField(task.riskLevel),
        escapeField(task.urgencyScore),
        escapeField(task.startTime),
        escapeField(task.endTime),
      ].join("|")
    );
  });

  return lines.join("\n");
}

function compileEngine() {
  const compiler = process.platform === "win32" ? "g++" : "g++";
  const args = ["-std=c++17", "-O2", "-o", ENGINE_BIN, ENGINE_SRC];
  const result = spawnSync(compiler, args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "C++ compilation failed");
  }
}

function ensureEngineCompiled() {
  const sourceStat = fs.statSync(ENGINE_SRC);
  if (fs.existsSync(ENGINE_BIN)) {
    const binStat = fs.statSync(ENGINE_BIN);
    if (binStat.mtimeMs >= sourceStat.mtimeMs) {
      return;
    }
  }
  compileEngine();
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Payload must be a JSON object.";
  }
  if (!Array.isArray(payload.satellites) || !Array.isArray(payload.tasks)) {
    return "Payload must include satellites[] and tasks[].";
  }
  return null;
}

function runEngine(payload, args = ["--api"]) {
  ensureEngineCompiled();
  const input = buildEngineInput(payload);
  const quotedArgs = args.map((arg) => `'${String(arg).replace(/'/g, "''")}'`).join(" ");
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `& '${ENGINE_BIN.replace(/'/g, "''")}' ${quotedArgs}`,
          ],
          {
            input,
            encoding: "utf8",
            timeout: 10000,
          }
        )
      : spawnSync(ENGINE_BIN, args, {
          input,
          encoding: "utf8",
          timeout: 10000,
        });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Scheduler execution failed");
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Scheduler returned invalid JSON: ${result.stdout}`);
  }
}

function demoPayload() {
  return {
    satellites: [
      {
        id: "SAT-001",
        name: "Sentinel Alpha",
        maxTasksPerOrbit: 4,
        coverableRegions: ["Pacific Ocean", "Arctic Sea", "Bering Sea"],
      },
      {
        id: "SAT-002",
        name: "OceanEye Beta",
        maxTasksPerOrbit: 3,
        coverableRegions: ["Indian Ocean", "Arabian Sea", "Red Sea"],
      },
      {
        id: "SAT-003",
        name: "CoastalWatch Gamma",
        maxTasksPerOrbit: 5,
        coverableRegions: ["Atlantic Ocean", "North Sea", "Pacific Ocean"],
      },
      {
        id: "SAT-004",
        name: "PolarSpy Delta",
        maxTasksPerOrbit: 3,
        coverableRegions: ["Arctic Sea", "Antarctic Ocean", "Bering Sea"],
      },
    ],
    tasks: [
      {
        id: "TSK-001",
        region: "Pacific Ocean",
        pollutionType: "Oil Spill",
        riskLevel: "High",
        urgencyScore: 95,
        startTime: 60,
        endTime: 120,
      },
      {
        id: "TSK-002",
        region: "Indian Ocean",
        pollutionType: "Plastic",
        riskLevel: "High",
        urgencyScore: 88,
        startTime: 100,
        endTime: 160,
      },
      {
        id: "TSK-003",
        region: "Arctic Sea",
        pollutionType: "Chemical",
        riskLevel: "High",
        urgencyScore: 92,
        startTime: 200,
        endTime: 260,
      },
      {
        id: "TSK-004",
        region: "Atlantic Ocean",
        pollutionType: "Industrial",
        riskLevel: "Medium",
        urgencyScore: 75,
        startTime: 60,
        endTime: 130,
      },
      {
        id: "TSK-005",
        region: "North Sea",
        pollutionType: "Plastic",
        riskLevel: "Medium",
        urgencyScore: 65,
        startTime: 300,
        endTime: 360,
      },
      {
        id: "TSK-006",
        region: "Arabian Sea",
        pollutionType: "Oil Spill",
        riskLevel: "High",
        urgencyScore: 90,
        startTime: 100,
        endTime: 180,
      },
      {
        id: "TSK-007",
        region: "Pacific Ocean",
        pollutionType: "Chemical",
        riskLevel: "Medium",
        urgencyScore: 70,
        startTime: 80,
        endTime: 140,
      },
      {
        id: "TSK-008",
        region: "Caspian Sea",
        pollutionType: "Industrial",
        riskLevel: "Low",
        urgencyScore: 40,
        startTime: 400,
        endTime: 450,
      },
      {
        id: "TSK-009",
        region: "Bering Sea",
        pollutionType: "Plastic",
        riskLevel: "Medium",
        urgencyScore: 60,
        startTime: 500,
        endTime: 550,
      },
      {
        id: "TSK-010",
        region: "Arctic Sea",
        pollutionType: "Oil Spill",
        riskLevel: "High",
        urgencyScore: 97,
        startTime: 200,
        endTime: 250,
      },
      {
        id: "TSK-011",
        region: "Red Sea",
        pollutionType: "Chemical",
        riskLevel: "Low",
        urgencyScore: 45,
        startTime: 600,
        endTime: 650,
      },
      {
        id: "TSK-012",
        region: "Antarctic Ocean",
        pollutionType: "Plastic",
        riskLevel: "Medium",
        urgencyScore: 55,
        startTime: 700,
        endTime: 760,
      },
    ],
  };
}

function serveStatic(res, pathname) {
  const target =
    pathname === "/" ? path.join(FRONTEND_DIR, "index.html") : path.join(FRONTEND_DIR, pathname);
  const normalized = path.normalize(target);

  if (!normalized.startsWith(FRONTEND_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(normalized).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };

  sendText(res, 200, fs.readFileSync(normalized, "utf8"), contentTypes[ext] || "text/plain; charset=utf-8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { status: "ok", engine: "C++ DSA Scheduler" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/demo") {
    sendJson(res, 200, demoPayload());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/schedule") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const result = runEngine(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Unexpected server error" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/search/task") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
      if (!payload.taskId || typeof payload.taskId !== "string") {
        sendJson(res, 400, { error: "taskId is required." });
        return;
      }

      const result = runEngine(payload, ["--api", "--search-task", payload.taskId]);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Unexpected server error" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/search/interval") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const startTime = Number(payload.startTime);
      const endTime = Number(payload.endTime);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        sendJson(res, 400, { error: "Valid startTime and endTime are required." });
        return;
      }

      const result = runEngine(payload, [
        "--api",
        "--search-interval",
        String(startTime),
        String(endTime),
      ]);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Unexpected server error" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/search/region") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
      if (!payload.region || typeof payload.region !== "string") {
        sendJson(res, 400, { error: "region is required." });
        return;
      }

      const result = runEngine(payload, ["--api", "--search-region", payload.region]);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Unexpected server error" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/search/risk") {
    try {
      const rawBody = await readRequestBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
      if (!payload.riskLevel || typeof payload.riskLevel !== "string") {
        sendJson(res, 400, { error: "riskLevel is required." });
        return;
      }

      const result = runEngine(payload, ["--api", "--search-risk", payload.riskLevel]);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Unexpected server error" });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(res, url.pathname);
    return;
  }

  sendText(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`OceanWatch server running at http://localhost:${PORT}`);
});
