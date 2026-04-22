const state = {
  satellites: [],
  tasks: [],
  results: null,
  editingSatelliteIndex: null,
  editingTaskIndex: null,
};

const satelliteForm = document.getElementById("satellite-form");
const taskForm = document.getElementById("task-form");
const taskSearchForm = document.getElementById("task-search-form");
const intervalSearchForm = document.getElementById("interval-search-form");
const regionSearchForm = document.getElementById("region-search-form");
const riskSearchForm = document.getElementById("risk-search-form");
const loadDemoButton = document.getElementById("load-demo");
const runSchedulerButton = document.getElementById("run-scheduler");
const statusEl = document.getElementById("status");
const statusBanner = document.getElementById("status-banner");
const satelliteSubmitButton = document.getElementById("satellite-submit-button");
const satelliteCancelButton = document.getElementById("satellite-cancel-button");
const taskSubmitButton = document.getElementById("task-submit-button");
const taskCancelButton = document.getElementById("task-cancel-button");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ffb4b4" : "";
  setBanner(message, isError ? "error" : "neutral");
}

function setBanner(message, type = "neutral") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner status-banner-${type}`;
}

function renderTaskIdOptions() {
  const datalist = document.getElementById("task-id-options");
  datalist.innerHTML = state.tasks
    .map((task) => `<option value="${escapeHtml(task.id)}"></option>`)
    .join("");
}

function riskBadge(level) {
  return `<span class="badge badge-${level.toLowerCase()}">${level}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetResults() {
  state.results = null;
  renderResults();
}

function setTaskFormMode() {
  const editing = state.editingTaskIndex !== null;
  taskSubmitButton.textContent = editing ? "Update Task" : "Add Task";
  taskCancelButton.hidden = !editing;
}

function setSatelliteFormMode() {
  const editing = state.editingSatelliteIndex !== null;
  satelliteSubmitButton.textContent = editing ? "Update Satellite" : "Add Satellite";
  satelliteCancelButton.hidden = !editing;
}

function clearSatelliteForm() {
  satelliteForm.reset();
  state.editingSatelliteIndex = null;
  setSatelliteFormMode();
}

function clearTaskForm() {
  taskForm.reset();
  state.editingTaskIndex = null;
  setTaskFormMode();
}

function normalizeRegion(region) {
  return String(region || "").trim().toLowerCase();
}

function coverageChecks() {
  const coveredRegions = new Set(
    state.satellites.flatMap((sat) => sat.coverableRegions.map((region) => normalizeRegion(region)))
  );

  return state.tasks.map((task) => ({
    ...task,
    covered: coveredRegions.has(normalizeRegion(task.region)),
  }));
}

function currentPayload(extra = {}) {
  return {
    satellites: state.satellites,
    tasks: state.tasks,
    ...extra,
  };
}

function resultCard(item) {
  const detail = item.accepted
    ? `<div class="mini-meta">${escapeHtml(item.selectionReason || "Accepted by scheduler.")}</div>`
    : `<div class="mini-meta">${escapeHtml(item.rejectionReason || "Rejected by scheduler.")}</div>
       <div class="mini-meta"><strong>Suggested fix:</strong> ${escapeHtml(item.suggestedSolution || "Adjust the task or satellite data and try again.")}</div>`;

  return `
    <article class="mini-card">
      <h3>${escapeHtml(item.id)}</h3>
      <div class="mini-meta">
        ${escapeHtml(item.region)} • ${item.startTime}-${item.endTime}
        ${item.satelliteName ? `• ${escapeHtml(item.satelliteName)}` : ""}
      </div>
      <div class="pill-row">
        <span class="pill">${escapeHtml(item.riskLevel)}</span>
        <span class="pill">Priority ${item.priority}</span>
      </div>
      ${detail}
    </article>
  `;
}

function addSatelliteFromForm(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const satellite = {
    id: formData.get("id").trim(),
    name: formData.get("name").trim(),
    maxTasksPerOrbit: Number(formData.get("maxTasksPerOrbit")),
    coverableRegions: formData
      .get("coverableRegions")
      .split(",")
      .map((region) => region.trim())
      .filter(Boolean),
  };

  if (!satellite.id || !satellite.name || !satellite.coverableRegions.length) {
    setStatus("Please fill all satellite fields correctly.", true);
    return;
  }

  if (state.editingSatelliteIndex !== null) {
    state.satellites[state.editingSatelliteIndex] = satellite;
    setStatus(`Satellite ${satellite.id} updated.`);
  } else {
    state.satellites.push(satellite);
    setStatus(`Satellite ${satellite.id} added.`);
  }

  clearSatelliteForm();
  resetResults();
  renderSatellites();
  renderCoverageWarnings();
}

function addTaskFromForm(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const task = {
    id: formData.get("id").trim(),
    region: formData.get("region").trim(),
    pollutionType: formData.get("pollutionType"),
    riskLevel: formData.get("riskLevel"),
    urgencyScore: Number(formData.get("urgencyScore")),
    startTime: Number(formData.get("startTime")),
    endTime: Number(formData.get("endTime")),
  };

  if (!task.id || !task.region || task.endTime <= task.startTime) {
    setStatus("Task window is invalid or fields are missing.", true);
    return;
  }

  if (state.editingTaskIndex !== null) {
    state.tasks[state.editingTaskIndex] = task;
    setStatus(`Task ${task.id} updated.`);
  } else {
    state.tasks.push(task);
    setStatus(`Task ${task.id} queued.`);
  }

  clearTaskForm();
  resetResults();
  renderTasks();
  renderCoverageWarnings();
}

async function loadDemo() {
  setStatus("Loading demo data...");
  try {
    const response = await fetch("/api/demo");
    const payload = await response.json();
    state.satellites = payload.satellites || [];
    state.tasks = payload.tasks || [];
    resetResults();
    renderSatellites();
    renderTasks();
    renderCoverageWarnings();
    setStatus("Demo data loaded. Run the C++ scheduler.");
  } catch (error) {
    setStatus(`Failed to load demo data: ${error.message}`, true);
  }
}

async function runScheduler() {
  if (!state.satellites.length || !state.tasks.length) {
    setStatus("Add at least one satellite and one task first.", true);
    return;
  }

  const uncoveredTasks = coverageChecks().filter((task) => !task.covered);
  if (uncoveredTasks.length) {
    setBanner(
      `Warning: some task regions are not covered by any satellite: ${uncoveredTasks.map((task) => task.id).join(", ")}. The backend will reject only those tasks and continue scheduling the others.`,
      "error"
    );
    renderCoverageWarnings();
  }

  setStatus("Running backend scheduler...");
  runSchedulerButton.disabled = true;

  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPayload()),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Scheduler request failed");
    }

    state.results = payload;
    renderResults();
    setBanner(
      `Scheduler finished. Accepted ${payload.analytics.scheduledTasks} and rejected ${payload.analytics.rejectedTasks} task(s).`,
      payload.analytics.rejectedTasks ? "neutral" : "success"
    );
    statusEl.textContent = "Scheduler finished successfully.";
    statusEl.style.color = "";
  } catch (error) {
    setStatus(`Scheduler failed: ${error.message}`, true);
  } finally {
    runSchedulerButton.disabled = false;
  }
}

async function searchTask(event) {
  event.preventDefault();
  const taskId = document.getElementById("task-search-input").value.trim();
  await runTaskSearch(taskId);
}

async function runTaskSearch(taskId) {
  const container = document.getElementById("task-search-result");

  if (!taskId) {
    setStatus("Enter a task ID to search.", true);
    return;
  }

  try {
    const response = await fetch("/api/search/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPayload({ taskId })),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Task search failed");
    }

    if (!payload.search?.found) {
      container.className = "stack-list empty";
      container.textContent = "No task found for that ID.";
      return;
    }

    container.className = "stack-list";
    container.innerHTML = resultCard(payload.search.result);
    setStatus(`Task ${taskId} found from backend search.`);
  } catch (error) {
    setStatus(`Task search failed: ${error.message}`, true);
  }
}

async function searchInterval(event) {
  event.preventDefault();
  const startTime = Number(document.getElementById("interval-start-input").value);
  const endTime = Number(document.getElementById("interval-end-input").value);
  const container = document.getElementById("interval-search-result");

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    setStatus("Enter a valid interval range.", true);
    return;
  }

  try {
    const response = await fetch("/api/search/interval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPayload({ startTime, endTime })),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Interval search failed");
    }

    if (!payload.matches?.length) {
      container.className = "stack-list empty";
      container.textContent = "No accepted tasks overlap that interval.";
      return;
    }

    container.className = "stack-list";
    container.innerHTML = payload.matches.map(resultCard).join("");
    setStatus(`Found ${payload.matches.length} accepted task(s) in the selected interval.`);
  } catch (error) {
    setStatus(`Interval search failed: ${error.message}`, true);
  }
}

async function searchRegion(event) {
  event.preventDefault();
  const region = document.getElementById("region-search-input").value.trim();
  const container = document.getElementById("region-search-result");

  if (!region) {
    setStatus("Enter a region to search.", true);
    return;
  }

  try {
    const response = await fetch("/api/search/region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPayload({ region })),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Region search failed");
    }

    if (!payload.matches?.length) {
      container.className = "stack-list empty";
      container.textContent = "No tasks found for that region.";
      return;
    }

    container.className = "stack-list";
    container.innerHTML = payload.matches.map(resultCard).join("");
    setStatus(`Found ${payload.matches.length} task(s) for region ${region}.`);
  } catch (error) {
    setStatus(`Region search failed: ${error.message}`, true);
  }
}

async function searchRisk(event) {
  event.preventDefault();
  const riskLevel = document.getElementById("risk-search-input").value;
  const container = document.getElementById("risk-search-result");

  try {
    const response = await fetch("/api/search/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPayload({ riskLevel })),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Risk search failed");
    }

    if (!payload.matches?.length) {
      container.className = "stack-list empty";
      container.textContent = "No tasks found for that risk level.";
      return;
    }

    container.className = "stack-list";
    container.innerHTML = payload.matches.map(resultCard).join("");
    setStatus(`Found ${payload.matches.length} task(s) with risk ${riskLevel}.`);
  } catch (error) {
    setStatus(`Risk search failed: ${error.message}`, true);
  }
}

function renderSatellites() {
  document.getElementById("satellite-count").textContent = `${state.satellites.length} satellites loaded`;
  const container = document.getElementById("satellite-list");

  if (!state.satellites.length) {
    container.className = "stack-list empty";
    container.textContent = "No satellites yet.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = state.satellites
    .map(
      (sat, index) => `
        <article class="mini-card">
          <h3>${escapeHtml(sat.name)}</h3>
          <div class="mini-meta">${escapeHtml(sat.id)} • capacity ${sat.maxTasksPerOrbit}</div>
          <div class="pill-row">
            ${sat.coverableRegions.map((region) => `<span class="pill">${escapeHtml(region)}</span>`).join("")}
          </div>
          <div class="action-row">
            <button class="btn btn-secondary action-btn" type="button" data-edit-satellite="${index}">Edit</button>
            <button class="btn btn-danger action-btn" type="button" data-delete-satellite="${index}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTasks() {
  document.getElementById("task-count").textContent = `${state.tasks.length} tasks waiting`;
  const tbody = document.getElementById("task-table");

  if (!state.tasks.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No tasks added.</td></tr>';
    renderTaskIdOptions();
    return;
  }

  tbody.innerHTML = state.tasks
    .map(
      (task, index) => `
        <tr>
          <td>${escapeHtml(task.id)}</td>
          <td>${escapeHtml(task.region)}</td>
          <td>${riskBadge(task.riskLevel)}</td>
          <td>${task.urgencyScore}</td>
          <td>${task.startTime}-${task.endTime}</td>
          <td>
            <div class="action-row">
              <button class="btn btn-secondary action-btn" type="button" data-search-task="${escapeHtml(task.id)}">Search</button>
              <button class="btn btn-secondary action-btn" type="button" data-edit-task="${index}">Edit</button>
              <button class="btn btn-danger action-btn" type="button" data-delete-task="${index}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
  renderTaskIdOptions();
}

function renderCoverageWarnings() {
  const container = document.getElementById("coverage-warning");
  if (!state.tasks.length) {
    container.className = "empty";
    container.textContent = "No tasks to validate yet.";
    return;
  }

  const checks = coverageChecks();
  const uncovered = checks.filter((task) => !task.covered);
  if (!uncovered.length) {
    container.className = "warning-list";
    container.innerHTML = '<div class="good-item">All task regions are covered by at least one satellite.</div>';
    return;
  }

  container.className = "warning-list";
  container.innerHTML = uncovered
    .map(
      (task) => `
        <div class="warning-item">
          <strong>${escapeHtml(task.id)}</strong> uses region <strong>${escapeHtml(task.region)}</strong>, but no satellite covers it.
        </div>
      `
    )
    .join("");
}

function renderComplexity(complexity) {
  const container = document.getElementById("complexity-panel");
  if (!complexity) {
    container.className = "feature-list empty";
    container.textContent = "Run the scheduler to load complexity notes.";
    return;
  }

  const items = [
    ["Priority Queue", complexity.priorityQueue],
    ["Coverage Graph", complexity.coverageGraph],
    ["BST Overlap", complexity.bstOverlap],
    ["Overall", complexity.overall],
  ];

  container.className = "feature-list";
  container.innerHTML = items
    .map(
      ([title, text]) => `
        <div class="complexity-card">
          <strong>${escapeHtml(title)}</strong>
          <div>${escapeHtml(text)}</div>
        </div>
      `
    )
    .join("");
}

function renderPriorityQueue(priorityQueueView) {
  const container = document.getElementById("priority-queue-list");
  if (!priorityQueueView?.length) {
    container.className = "stack-list empty";
    container.textContent = "Run the scheduler to inspect queue order.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = priorityQueueView
    .map(
      (item) => `
        <article class="mini-card queue-row">
          <div class="queue-rank">${item.rank}</div>
          <div>
            <h3>${escapeHtml(item.id)}</h3>
            <div class="mini-meta">${escapeHtml(item.region)} • ${escapeHtml(item.riskLevel)} • ${item.startTime}-${item.endTime}</div>
          </div>
          <div class="pill">P ${item.priority}</div>
        </article>
      `
    )
    .join("");
}

function renderCoverageGraph(coverageGraph) {
  const satContainer = document.getElementById("satellite-region-list");
  const regionContainer = document.getElementById("region-satellite-list");
  const graphCanvas = document.getElementById("coverage-graph-canvas");

  if (!coverageGraph) {
    satContainer.className = "stack-list empty";
    regionContainer.className = "stack-list empty";
    graphCanvas.className = "graph-canvas empty";
    graphCanvas.textContent = "Run the scheduler to draw the coverage graph.";
    satContainer.textContent = "No graph data yet.";
    regionContainer.textContent = "No graph data yet.";
    return;
  }

  satContainer.className = "stack-list";
  satContainer.innerHTML = (coverageGraph.satelliteToRegions || [])
    .map(
      (entry) => `
        <article class="mini-card">
          <h3>${escapeHtml(entry.satelliteName)}</h3>
          <div class="mini-meta">${escapeHtml(entry.satelliteId)}</div>
          <div class="pill-row">
            ${(entry.regions || []).map((region) => `<span class="pill">${escapeHtml(region)}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("") || "No graph data yet.";

  regionContainer.className = "stack-list";
  regionContainer.innerHTML = (coverageGraph.regionToSatellites || [])
    .map(
      (entry) => `
        <article class="mini-card">
          <h3>${escapeHtml(entry.region)}</h3>
          <div class="pill-row">
            ${(entry.satellites || []).map((satellite) => `<span class="pill">${escapeHtml(satellite)}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("") || "No graph data yet.";

  const satellites = coverageGraph.satelliteToRegions || [];
  const regions = coverageGraph.regionToSatellites || [];

  if (!satellites.length || !regions.length) {
    graphCanvas.className = "graph-canvas empty";
    graphCanvas.textContent = "No graph nodes to draw.";
    return;
  }

  graphCanvas.className = "graph-canvas";

  const width = 920;
  const topY = 76;
  const bottomY = 250;
  const satGap = width / (satellites.length + 1);
  const regionGap = width / (regions.length + 1);

  const satelliteNodes = satellites.map((sat, index) => ({
    ...sat,
    x: satGap * (index + 1),
    y: topY,
  }));

  const regionNodes = regions.map((region, index) => ({
    ...region,
    x: regionGap * (index + 1),
    y: bottomY,
  }));

  const edges = [];
  satelliteNodes.forEach((sat) => {
    (sat.regions || []).forEach((regionName) => {
      const regionNode = regionNodes.find((region) => region.region === regionName);
      if (regionNode) {
        edges.push({ from: sat, to: regionNode });
      }
    });
  });

  graphCanvas.innerHTML = `
    <svg class="graph-svg" viewBox="0 0 ${width} 320" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#45d0ff" stop-opacity="0.9"></stop>
          <stop offset="100%" stop-color="#55f0b1" stop-opacity="0.75"></stop>
        </linearGradient>
      </defs>
      ${edges
        .map(
          (edge) => `
            <path d="M ${edge.from.x} ${edge.from.y + 18} C ${edge.from.x} 150, ${edge.to.x} 170, ${edge.to.x} ${edge.to.y - 18}"
              fill="none" stroke="url(#edgeGlow)" stroke-width="2.2" opacity="0.7"></path>
          `
        )
        .join("")}
      ${satelliteNodes
        .map(
          (node) => `
            <g>
              <circle cx="${node.x}" cy="${node.y}" r="28" fill="rgba(69,208,255,0.16)" stroke="#45d0ff" stroke-width="2.2"></circle>
              <text x="${node.x}" y="${node.y + 4}" text-anchor="middle" class="graph-node-label">SAT</text>
              <text x="${node.x}" y="${node.y + 48}" text-anchor="middle" class="graph-edge-label">${escapeHtml(node.satelliteId)}</text>
            </g>
          `
        )
        .join("")}
      ${regionNodes
        .map(
          (node) => `
            <g>
              <rect x="${node.x - 42}" y="${node.y - 22}" width="84" height="44" rx="14"
                fill="rgba(85,240,177,0.12)" stroke="#55f0b1" stroke-width="2"></rect>
              <text x="${node.x}" y="${node.y + 4}" text-anchor="middle" class="graph-edge-label">${escapeHtml(
                node.region.length > 14 ? `${node.region.slice(0, 14)}...` : node.region
              )}</text>
            </g>
          `
        )
        .join("")}
    </svg>
  `;
}

function renderTimeline(timeline) {
  const container = document.getElementById("timeline-list");
  if (!timeline?.length) {
    container.className = "timeline-list empty";
    container.textContent = "Run the scheduler to view accepted windows.";
    return;
  }

  container.className = "timeline-list";
  container.innerHTML = timeline
    .map((item) => {
      const left = Math.max(0, (item.startTime / 1440) * 100);
      const width = Math.max(4, ((item.endTime - item.startTime) / 1440) * 100);
      return `
        <article class="timeline-item">
          <strong>${escapeHtml(item.taskId)} • ${escapeHtml(item.satelliteId)}</strong>
          <div class="mini-meta">${escapeHtml(item.region)} • ${item.startTime}-${item.endTime}</div>
          <div class="timeline-track"><span style="left:${left}%; width:${width}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function renderRiskDistribution(analytics) {
  const container = document.getElementById("risk-distribution-list");
  const distribution = analytics?.riskDistribution;
  if (!distribution) {
    container.className = "stack-list empty";
    container.textContent = "No risk data yet.";
    return;
  }

  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0) || 1;
  const levels = [
    ["High", distribution.High || 0, "risk-bar-high"],
    ["Medium", distribution.Medium || 0, "risk-bar-medium"],
    ["Low", distribution.Low || 0, "risk-bar-low"],
  ];

  container.className = "stack-list";
  container.innerHTML = `
    <article class="mini-card risk-bar">
      ${levels
        .map(
          ([label, count, klass]) => `
            <div class="risk-bar-row">
              <strong>${label}</strong>
              <div class="risk-bar-track"><span class="${klass}" style="width:${(count / total) * 100}%"></span></div>
              <span>${count}</span>
            </div>
          `
        )
        .join("")}
    </article>
  `;
}

function renderSortedSchedules(sortedSchedules) {
  const container = document.getElementById("sorted-schedules-list");
  if (!sortedSchedules?.length) {
    container.className = "stack-list empty";
    container.textContent = "Run the scheduler to inspect per-satellite sorted schedules.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = sortedSchedules
    .map(
      (schedule) => `
        <article class="mini-card">
          <h3>${escapeHtml(schedule.satelliteName)}</h3>
          <div class="mini-meta">${escapeHtml(schedule.satelliteId)}</div>
          <div class="stack-list">
            ${schedule.tasks.length
              ? schedule.tasks
                  .map(
                    (task) => `
                      <div class="good-item">
                        <strong>${escapeHtml(task.id)}</strong> • ${escapeHtml(task.region)} • ${task.startTime}-${task.endTime}
                      </div>
                    `
                  )
                  .join("")
              : '<div class="empty">No accepted tasks for this satellite.</div>'}
          </div>
        </article>
      `
    )
    .join("");
}

function renderUncoveredRegions(uncoveredRegions) {
  const container = document.getElementById("uncovered-regions-list");
  if (!uncoveredRegions?.length) {
    container.className = "stack-list";
    container.innerHTML = '<div class="good-item">All task regions are covered by at least one satellite.</div>';
    return;
  }

  container.className = "stack-list";
  container.innerHTML = uncoveredRegions
    .map(
      (item) => `
        <article class="warning-item">
          <strong>${escapeHtml(item.region)}</strong> • ${item.taskCount} uncovered task(s)
        </article>
      `
    )
    .join("");
}

function renderTopPending(topPendingTasks) {
  const container = document.getElementById("top-pending-list");
  if (!topPendingTasks?.length) {
    container.className = "stack-list empty";
    container.textContent = "No pending tasks after scheduling.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = topPendingTasks.map(resultCard).join("");
}

function renderSatelliteRanking(satelliteRanking) {
  const container = document.getElementById("satellite-ranking-list");
  if (!satelliteRanking?.length) {
    container.className = "stack-list empty";
    container.textContent = "Run the scheduler to inspect satellite ranking.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = satelliteRanking
    .map(
      (sat, index) => `
        <article class="mini-card queue-row">
          <div class="queue-rank">${index + 1}</div>
          <div>
            <h3>${escapeHtml(sat.name)}</h3>
            <div class="mini-meta">${escapeHtml(sat.satelliteId)} • ${sat.assigned}/${sat.maxTasks} tasks</div>
          </div>
          <div class="pill">${sat.utilization}%</div>
        </article>
      `
    )
    .join("");
}

function renderRegionReport(regionCoverageReport) {
  const container = document.getElementById("region-report-list");
  if (!regionCoverageReport?.length) {
    container.className = "stack-list empty";
    container.textContent = "Run the scheduler to inspect region coverage report.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = regionCoverageReport
    .map(
      (entry) => `
        <article class="mini-card">
          <h3>${escapeHtml(entry.region)}</h3>
          <div class="mini-meta">${entry.taskCount} task(s) • ${entry.covered ? "covered" : "not covered"}</div>
          <div class="pill-row">
            ${(entry.coveringSatellites || []).map((sat) => `<span class="pill">${escapeHtml(sat)}</span>`).join("") || '<span class="pill">No coverage</span>'}
          </div>
        </article>
      `
    )
    .join("");
}

function renderWaitingList(waitingList) {
  const container = document.getElementById("waiting-list");
  if (!waitingList?.length) {
    container.className = "stack-list empty";
    container.textContent = "No waiting list items.";
    return;
  }

  container.className = "stack-list";
  container.innerHTML = waitingList.map(resultCard).join("");
}

function renderResults() {
  const acceptedBody = document.getElementById("accepted-table");
  const rejectedBody = document.getElementById("rejected-table");
  const utilizationList = document.getElementById("utilization-list");

  if (!state.results) {
    document.getElementById("stat-total").textContent = state.tasks.length;
    document.getElementById("stat-scheduled").textContent = 0;
    document.getElementById("stat-rejected").textContent = 0;
    document.getElementById("stat-efficiency").textContent = "0%";
    acceptedBody.innerHTML = '<tr><td colspan="5" class="empty-row">Run the scheduler to see accepted tasks here.</td></tr>';
    rejectedBody.innerHTML = '<tr><td colspan="4" class="empty-row">Rejected tasks will appear here after scheduling.</td></tr>';
    utilizationList.className = "stack-list empty";
    utilizationList.textContent = "Satellite usage will appear here after scheduling.";
    renderComplexity(null);
    renderPriorityQueue(null);
    renderCoverageGraph(null);
    renderTimeline(null);
    renderRiskDistribution(null);
    renderSortedSchedules(null);
    renderUncoveredRegions(null);
    renderTopPending(null);
    renderSatelliteRanking(null);
    renderRegionReport(null);
    renderWaitingList(null);
    renderCoverageWarnings();
    return;
  }

  const {
    analytics,
    accepted,
    rejected,
    satelliteUtilization,
    priorityQueueView,
    coverageGraph,
    timeline,
    complexity,
    sortedSchedules,
    uncoveredRegions,
    topPendingTasks,
    satelliteRanking,
    regionCoverageReport,
    waitingList,
  } = state.results;

  document.getElementById("stat-total").textContent = analytics.totalTasks;
  document.getElementById("stat-scheduled").textContent = analytics.scheduledTasks;
  document.getElementById("stat-rejected").textContent = analytics.rejectedTasks;
  document.getElementById("stat-efficiency").textContent = `${analytics.schedulingEfficiency}%`;

  acceptedBody.innerHTML = accepted.length
    ? accepted
        .map(
          (task) => `
            <tr>
              <td>${escapeHtml(task.id)}</td>
              <td>${escapeHtml(task.region)}</td>
              <td>${escapeHtml(task.satelliteName)}</td>
              <td>${task.priority}</td>
              <td>${task.startTime}-${task.endTime}</td>
            </tr>
            <tr>
              <td colspan="5" class="mini-meta">${escapeHtml(task.selectionReason)}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="5" class="empty-row">No accepted tasks.</td></tr>';

  rejectedBody.innerHTML = rejected.length
    ? rejected
        .map(
          (task) => `
            <tr>
              <td>${escapeHtml(task.id)}</td>
              <td>${escapeHtml(task.region)}</td>
              <td>${riskBadge(task.riskLevel)}</td>
              <td>${escapeHtml(task.rejectionReason)}</td>
            </tr>
            <tr>
              <td colspan="4" class="mini-meta"><strong>Suggested fix:</strong> ${escapeHtml(task.suggestedSolution || "Adjust the task or satellite data and try again.")}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="4" class="empty-row">No rejected tasks.</td></tr>';

  utilizationList.className = "stack-list";
  utilizationList.innerHTML = satelliteUtilization
    .map(
      (sat) => `
        <article class="mini-card">
          <h3>${escapeHtml(sat.name)}</h3>
          <div class="mini-meta">${escapeHtml(sat.satelliteId)} • ${sat.assigned}/${sat.maxTasks} tasks</div>
          <div class="progress"><span style="width:${sat.utilization}%"></span></div>
          <div class="pill-row"><span class="pill">${sat.utilization}% utilized</span></div>
        </article>
      `
    )
    .join("");

  renderComplexity(complexity);
  renderPriorityQueue(priorityQueueView);
  renderCoverageGraph(coverageGraph);
  renderTimeline(timeline);
  renderRiskDistribution(analytics);
  renderSortedSchedules(sortedSchedules);
  renderUncoveredRegions(uncoveredRegions);
  renderTopPending(topPendingTasks);
  renderSatelliteRanking(satelliteRanking);
  renderRegionReport(regionCoverageReport);
  renderWaitingList(waitingList);
}

document.getElementById("task-search-result").textContent = "Search a task ID to see backend search results here.";
document.getElementById("interval-search-result").textContent = "Search a time range to see overlapping accepted tasks here.";

satelliteForm.addEventListener("submit", addSatelliteFromForm);
satelliteCancelButton.addEventListener("click", () => {
  clearSatelliteForm();
  setStatus("Satellite edit cancelled.");
});
taskForm.addEventListener("submit", addTaskFromForm);
taskCancelButton.addEventListener("click", () => {
  clearTaskForm();
  setStatus("Task edit cancelled.");
});
taskSearchForm.addEventListener("submit", searchTask);
intervalSearchForm.addEventListener("submit", searchInterval);
regionSearchForm.addEventListener("submit", searchRegion);
riskSearchForm.addEventListener("submit", searchRisk);
loadDemoButton.addEventListener("click", loadDemo);
runSchedulerButton.addEventListener("click", runScheduler);

document.getElementById("satellite-list").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-satellite]");
  const deleteButton = event.target.closest("[data-delete-satellite]");

  if (editButton) {
    const index = Number(editButton.dataset.editSatellite);
    const satellite = state.satellites[index];
    if (!satellite) return;

    satelliteForm.elements.id.value = satellite.id;
    satelliteForm.elements.name.value = satellite.name;
    satelliteForm.elements.maxTasksPerOrbit.value = satellite.maxTasksPerOrbit;
    satelliteForm.elements.coverableRegions.value = satellite.coverableRegions.join(", ");
    state.editingSatelliteIndex = index;
    setSatelliteFormMode();
    setStatus(`Editing satellite ${satellite.id}.`);
    satelliteForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (deleteButton) {
    const index = Number(deleteButton.dataset.deleteSatellite);
    const [removedSatellite] = state.satellites.splice(index, 1);
    if (state.editingSatelliteIndex === index) {
      clearSatelliteForm();
    } else if (state.editingSatelliteIndex !== null && index < state.editingSatelliteIndex) {
      state.editingSatelliteIndex -= 1;
      setSatelliteFormMode();
    }
    resetResults();
    renderSatellites();
    renderCoverageWarnings();
    setStatus(`Satellite ${removedSatellite?.id || ""} deleted.`);
  }
});

document.getElementById("task-table").addEventListener("click", (event) => {
  const searchButton = event.target.closest("[data-search-task]");
  const editButton = event.target.closest("[data-edit-task]");
  const deleteButton = event.target.closest("[data-delete-task]");

  if (searchButton) {
    const taskId = searchButton.dataset.searchTask;
    document.getElementById("task-search-input").value = taskId;
    runTaskSearch(taskId);
    document.getElementById("task-search-form").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (editButton) {
    const index = Number(editButton.dataset.editTask);
    const task = state.tasks[index];
    if (!task) return;

    taskForm.elements.id.value = task.id;
    taskForm.elements.region.value = task.region;
    taskForm.elements.pollutionType.value = task.pollutionType;
    taskForm.elements.riskLevel.value = task.riskLevel;
    taskForm.elements.urgencyScore.value = task.urgencyScore;
    taskForm.elements.startTime.value = task.startTime;
    taskForm.elements.endTime.value = task.endTime;
    state.editingTaskIndex = index;
    setTaskFormMode();
    setStatus(`Editing task ${task.id}.`);
    taskForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (deleteButton) {
    const index = Number(deleteButton.dataset.deleteTask);
    const [removedTask] = state.tasks.splice(index, 1);
    if (state.editingTaskIndex === index) {
      clearTaskForm();
    } else if (state.editingTaskIndex !== null && index < state.editingTaskIndex) {
      state.editingTaskIndex -= 1;
      setTaskFormMode();
    }
    resetResults();
    renderTasks();
    renderCoverageWarnings();
    setStatus(`Task ${removedTask?.id || ""} deleted.`);
  }
});

renderSatellites();
renderTasks();
renderResults();
renderCoverageWarnings();
renderTaskIdOptions();
setSatelliteFormMode();
setTaskFormMode();
