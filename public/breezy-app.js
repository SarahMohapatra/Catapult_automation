/**
 * Breezy frontend ↔ Catapult API (same contract as public/index.html).
 * Pages call Breezy.init('home'|'dashboard'|'config'|'code') after load.
 */
(function (global) {
  "use strict";

  var PATHS = {
    home: "/",
    dashboard: "/dashboard",
    config: "/config-monitor",
    code: "/code-monitor",
    console: "/console",
  };

  var CODE_BUGS = {
    "l1-divide-zero": {
      target: "  const maxValue = 100;",
      buggy: "  const maxValue = 0;",
    },
    "l1-negative-discount": {
      target: "  const discount = 10;",
      buggy: "  const discount = -10;",
    },
    "l1-commented-return": {
      target:
        "  const subtotal = orders.reduce((sum, price) => sum + price, 0);",
      buggy:
        "  // const subtotal = orders.reduce((sum, price) => sum + price, 0);",
    },
    "l2-inverted-condition": {
      target: "  if (activityPoints < 0) {",
      buggy: "  if (activityPoints > 0) {",
    },
    "l2-wrong-operator": {
      target: "  return activityPoints * multiplier;",
      buggy: "  return activityPoints / multiplier;",
    },
    "l2-wrong-filter": {
      target:
        "  const lowStock = items.filter((item) => item.stock < item.minimum);",
      buggy:
        "  const lowStock = items.filter((item) => item.stock > item.minimum);",
    },
  };

  var tickets = [];
  var serverConfig = null;
  var serverCode = "";
  var configDirty = false;
  var codeDirty = false;
  var es = null;
  var maxActivity = 40;

  function esc(s) {
    if (s == null || s === "") return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtStatus(s) {
    return (
      {
        pending: "Pending",
        in_progress: "In Progress",
        resolved: "Resolved",
        failed: "Failed",
        needs_human_review: "Needs Human Review",
      }[s] || s
    );
  }

  function timeAgo(iso) {
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function upsertTicket(t) {
    var idx = tickets.findIndex(function (x) {
      return x.id === t.id;
    });
    if (idx >= 0) tickets[idx] = t;
    else tickets.unshift(t);
  }

  function connectSSE() {
    if (es) return;
    es = new EventSource("/api/events");
    es.addEventListener("connected", function (e) {
      var data = JSON.parse(e.data);
      if (data.tickets) tickets = data.tickets;
      if (data.workerSource) syncCodeFromServer(data.workerSource);
      renderAll();
    });
    es.addEventListener("ticket_created", function (e) {
      var data = JSON.parse(e.data);
      upsertTicket(data.ticket);
      pushActivity("ticket", "Ticket created: " + data.ticket.id);
      renderAll();
    });
    es.addEventListener("ticket_updated", function (e) {
      var data = JSON.parse(e.data);
      upsertTicket(data.ticket);
      pushActivity("ticket", "Ticket updated: " + data.ticket.id + " — " + data.ticket.status);
      renderAll();
    });
    es.addEventListener("pipeline_complete", function (e) {
      var data = JSON.parse(e.data);
      tickets = data.tickets || tickets;
      if (data.config) syncConfigFromServer(data.config);
      if (data.workerSource) syncCodeFromServer(data.workerSource);
      pushActivity("status", "Pipeline run complete");
      renderAll();
    });
    es.addEventListener("config_updated", function (e) {
      var data = JSON.parse(e.data);
      if (data.config) syncConfigFromServer(data.config);
    });
    es.addEventListener("config_snapshot", function (e) {
      var data = JSON.parse(e.data);
      if (data.config) syncConfigFromServer(data.config);
    });
    es.addEventListener("code_snapshot", function (e) {
      var data = JSON.parse(e.data);
      if (data.source) syncCodeFromServer(data.source);
    });
    es.addEventListener("code_updated", function (e) {
      var data = JSON.parse(e.data);
      if (data.source) syncCodeFromServer(data.source);
    });
    es.addEventListener("check", function (e) {
      var data = JSON.parse(e.data);
      var dot = document.getElementById("breezy-status-dot");
      if (dot) {
        if (data.healthy) {
          dot.className =
            "w-3 h-3 bg-green-500 rounded-full animate-pulse";
        } else {
          dot.className = "w-3 h-3 bg-red-500 rounded-full animate-pulse";
        }
      }
      pushActivity("check", data.healthy ? "Check: healthy" : "Check: " + data.issueCount + " issue(s)");
    });
    es.addEventListener("log", function (e) {
      var data = JSON.parse(e.data);
      pushActivity("log", "[" + data.type + "] " + data.message);
    });
    es.addEventListener("agent_step", function (e) {
      var data = JSON.parse(e.data);
      var tid = data.ticketId || "";
      var line =
        (data.type || "") +
        (data.toolName ? " · " + data.toolName : "") +
        " — " +
        (data.content || "").slice(0, 200);
      pushActivity("agent_step", tid + " " + line);
    });
    es.addEventListener("monitoring_paused", function (e) {
      var data = JSON.parse(e.data);
      pushActivity("warn", "Monitoring paused — " + (data.reason || "L3"));
    });
    es.addEventListener("monitoring_resumed", function () {
      pushActivity("status", "Monitoring resumed");
    });
  }

  function syncConfigFromServer(cfg) {
    serverConfig = cfg;
    if (!configDirty) loadConfigEditor();
    applyConfigToDashboardHero(cfg);
  }

  function loadConfigEditor() {
    var ta = document.getElementById("breezy-config-editor");
    if (ta && serverConfig) {
      ta.value = JSON.stringify(serverConfig, null, 2);
      ta.classList.remove("ring-2", "ring-error");
    }
    var err = document.getElementById("breezy-config-error");
    if (err) err.textContent = "";
    configDirty = false;
  }

  function syncCodeFromServer(src, force) {
    serverCode = src || "";
    if (force || !codeDirty) loadCodeEditor();
  }

  function loadCodeEditor() {
    var ta = document.getElementById("breezy-code-editor");
    if (ta) ta.value = serverCode;
    codeDirty = false;
    var err = document.getElementById("breezy-code-error");
    if (err) err.textContent = "";
  }

  function applyConfigToDashboardHero(cfg) {
    if (!cfg) return;
    var title = document.getElementById("breezy-health-title");
    var sub = document.getElementById("breezy-health-sub");
    if (title && sub) {
      var open = tickets.filter(function (t) {
        return (
          t.status === "pending" ||
          t.status === "in_progress" ||
          t.status === "needs_human_review"
        );
      }).length;
      if (open > 0) {
        title.textContent = "Attention: open tickets";
        sub.textContent =
          open +
          " ticket(s) need follow-up. Breezy agents are processing or awaiting review.";
      } else {
        title.textContent = "System Health: Optimal";
        sub.textContent =
          "All core automation nodes are aligned with demo/config.json and worker-logic.ts.";
      }
    }
  }

  function renderAll() {
    renderDashboardTickets();
    renderConfigStatus();
    applyConfigToDashboardHero(serverConfig);
  }

  function ticketAccentBorder(status) {
    var map = {
      pending: "border-l-[3px] border-l-amber-500",
      in_progress: "border-l-[3px] border-l-primary",
      needs_human_review: "border-l-[3px] border-l-orange-600",
      resolved: "border-l-[3px] border-l-emerald-600",
      failed: "border-l-[3px] border-l-error",
    };
    return map[status] || "border-l-[3px] border-l-slate-300";
  }

  function statusPillClass(status) {
    var map = {
      pending: "bg-amber-50 text-amber-950 ring-1 ring-amber-200/80",
      in_progress: "bg-primary/12 text-primary ring-1 ring-primary/25",
      needs_human_review: "bg-orange-50 text-orange-950 ring-1 ring-orange-200/80",
      resolved: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80",
      failed: "bg-error-container text-on-error-container ring-1 ring-error/20",
    };
    return map[status] || "bg-surface-container text-on-surface-variant";
  }

  function tierPillClass(tier) {
    var map = {
      L1: "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90",
      L2: "bg-secondary-container text-on-secondary-container ring-1 ring-secondary/15",
      L3: "bg-tertiary-fixed text-on-tertiary-fixed ring-1 ring-tertiary/25",
    };
    return map[tier] || "bg-surface-container-high text-on-surface-variant ring-1 ring-outline-variant/40";
  }

  function renderDashboardTickets() {
    var el = document.getElementById("breezy-live-tickets");
    if (!el) return;
    var sorted = tickets
      .slice()
      .sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    var active = sorted.filter(function (t) {
      return (
        t.status !== "resolved" &&
        t.status !== "failed"
      );
    }).length;
    var badge = document.getElementById("breezy-ticket-count");
    if (badge) badge.textContent = active + " Active";

    if (!sorted.length) {
      el.innerHTML =
        '<div class="flex flex-col items-center justify-center text-center py-14 px-6 rounded-xl border border-dashed border-outline-variant/50 bg-gradient-to-b from-surface-container-low/80 to-surface-container-lowest">' +
        '<span class="material-symbols-outlined text-[2.75rem] text-primary/25 mb-4" style="font-variation-settings: \'FILL\' 0;">receipt_long</span>' +
        '<p class="font-headline text-on-surface text-base font-semibold tracking-tight mb-2">No tickets in the queue</p>' +
        '<p class="text-on-surface-variant text-sm max-w-sm leading-relaxed">Open <a class="text-primary font-semibold underline decoration-primary/30 underline-offset-2 hover:decoration-primary" href="' +
        PATHS.config +
        '">Config Monitor</a> or <a class="text-primary font-semibold underline decoration-primary/30 underline-offset-2 hover:decoration-primary" href="' +
        PATHS.code +
        '">Code Monitor</a> to inject a fault, or use the <a class="text-primary font-semibold underline decoration-primary/30 underline-offset-2 hover:decoration-primary" href="' +
        PATHS.console +
        '">legacy console</a>.</p></div>';
      return;
    }

    el.innerHTML = sorted
      .map(function (t) {
        var accent = ticketAccentBorder(t.status);
        var stClass = statusPillClass(t.status);
        var tierHtml = t.tier
          ? '<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ' +
            tierPillClass(t.tier) +
            '">' +
            esc(t.tier) +
            "</span>"
          : "";
        var hasReport = t.agentOutput && t.agentOutput.solution;
        var sol = hasReport ? t.agentOutput.solution || "" : "";
        var reportText =
          hasReport
            ? esc(sol.slice(0, 320)) + (sol.length > 320 ? "…" : "")
            : "";
        var desc = (t.description || "").trim();
        var descShort = desc.slice(0, 220);
        var descHtml =
          desc.length > 0
            ? '<p class="text-sm text-on-surface-variant leading-relaxed">' +
              esc(descShort) +
              (desc.length > 220 ? "…" : "") +
              "</p>"
            : "";
        var metaSep = tierHtml
          ? '<span class="text-on-surface-variant/35 select-none px-0.5" aria-hidden="true">·</span>'
          : "";
        return (
          '<article class="group relative overflow-hidden rounded-xl border border-outline-variant/20 bg-white shadow-[0_1px_2px_rgba(0,40,80,0.04)] hover:shadow-[0_12px_32px_rgba(0,98,157,0.09)] transition-[box-shadow] duration-300 ' +
          accent +
          '">' +
          '<div class="pl-4 pr-4 py-4 sm:pl-5 sm:pr-5">' +
          '<div class="flex flex-col lg:flex-row lg:items-start lg:gap-8 gap-4">' +
          '<div class="min-w-0 flex-1 space-y-2.5">' +
          '<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">' +
          tierHtml +
          metaSep +
          '<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ' +
          stClass +
          '">' +
          esc(fmtStatus(t.status)) +
          "</span>" +
          '<span class="text-[11px] text-on-surface-variant/75 font-mono tabular-nums tracking-tight">' +
          esc(t.id) +
          "</span>" +
          "</div>" +
          '<h3 class="font-headline text-lg font-semibold text-on-surface tracking-tight leading-snug">' +
          esc(t.title) +
          "</h3>" +
          descHtml +
          '<p class="text-xs text-on-surface-variant/65 flex items-center gap-1.5 pt-0.5">' +
          '<span class="material-symbols-outlined text-[15px] opacity-55" style="font-variation-settings: \'FILL\' 0;">schedule</span>' +
          "<span>" +
          esc(timeAgo(t.createdAt)) +
          "</span></p>" +
          "</div>" +
          (hasReport
            ? '<aside class="lg:max-w-[min(100%,20rem)] lg:flex-shrink-0 w-full rounded-lg bg-gradient-to-br from-surface-container-low to-surface-container-lowest/80 border border-outline-variant/35 p-4 shadow-inner">' +
              '<p class="text-[10px] font-bold uppercase tracking-[0.12em] text-primary mb-2">Agent summary</p>' +
              '<p class="text-sm text-on-surface leading-relaxed">' +
              reportText +
              "</p></aside>"
            : "") +
          "</div></div></article>"
        );
      })
      .join("");
  }

  function renderConfigStatus() {
    var statusTitle = document.getElementById("breezy-config-status-title");
    var statusSub = document.getElementById("breezy-config-status-sub");
    if (!statusTitle || !statusSub) return;
    var open = tickets.filter(function (t) {
      return (
        t.status === "pending" ||
        t.status === "in_progress" ||
        t.status === "needs_human_review"
      );
    }).length;
    if (open > 0) {
      statusTitle.textContent = "Resolving Issues…";
      statusSub.textContent = open + " active ticket(s) in the pipeline.";
    } else {
      statusTitle.textContent = "All clear";
      statusSub.textContent = "No open tickets. Inject a fault to demo the agents.";
    }
  }

  var agentActivityRows = [];
  var codeActivityRows = [];

  function pushActivity(kind, message) {
    var agentEl = document.getElementById("breezy-agent-activity");
    var codeEl = document.getElementById("breezy-activity-code");
    var ts = new Date().toISOString().slice(11, 19);
    if (agentEl) {
      var color =
        kind === "warn"
          ? "text-tertiary"
          : kind === "ticket" || kind === "agent_step"
          ? "text-primary"
          : "text-on-surface-variant";
      var row =
        '<div class="glass-panel p-3 rounded-lg border border-white/60 shadow-sm">' +
        '<div class="flex justify-between items-center mb-1 gap-2">' +
        '<span class="text-[10px] font-bold uppercase ' +
        color +
        '">' +
        esc(kind) +
        "</span>" +
        '<span class="text-[10px] text-on-surface-variant font-mono">' +
        esc(ts) +
        "</span></div>" +
        '<p class="text-xs text-on-surface leading-relaxed">' +
        esc(message) +
        "</p></div>";
      agentActivityRows.unshift(row);
      if (agentActivityRows.length > maxActivity) agentActivityRows.pop();
      agentEl.innerHTML = agentActivityRows.join("");
    }
    if (codeEl) {
      var termRow =
        '<div class="flex flex-col gap-0.5 border-b border-white/5 pb-2 mb-2">' +
        '<div class="text-green-400 font-mono">' +
        esc(ts) +
        ' <span class="text-white/40">[' +
        esc(kind) +
        "]</span></div>" +
        '<div class="text-white/80">' +
        esc(message) +
        "</div></div>";
      codeActivityRows.unshift(termRow);
      if (codeActivityRows.length > maxActivity) codeActivityRows.pop();
      codeEl.innerHTML = codeActivityRows.join("");
    }
  }

  async function fetchInitial() {
    try {
      var tr = await fetch("/api/tickets");
      if (tr.ok) tickets = await tr.json();
    } catch (e) {}
    try {
      var cr = await fetch("/api/config");
      if (cr.ok) {
        serverConfig = await cr.json();
        loadConfigEditor();
      }
    } catch (e) {}
    try {
      var codeR = await fetch("/api/code");
      if (codeR.ok) {
        var cd = await codeR.json();
        syncCodeFromServer(cd.source);
      }
    } catch (e) {}
    renderAll();
  }

  async function injectFault(type) {
    try {
      var r = await fetch("/api/config");
      var config = await r.json();
      switch (type) {
        case "lock_user": {
          var k = Object.keys(config.users || {});
          if (k.length) config.users[k[0]].locked = true;
          break;
        }
        case "disable_mfa": {
          var k2 = Object.keys(config.users || {});
          if (k2.length) config.users[k2[0]].mfaEnabled = false;
          break;
        }
        case "wipe_api_key":
          config.paymentService.apiKey = "";
          break;
        case "disable_service":
          config.userService.enabled = false;
          break;
        case "zero_pool":
          config.database.poolSize = 0;
          break;
        case "zero_rate_limit":
          config.emailService.rateLimit = 0;
          break;
        case "crash_services": {
          var sn = Object.keys(config.services || {});
          for (var i = 0; i < sn.length; i++)
            config.services[sn[i]].status = "CRASHED";
          break;
        }
        case "total_db_failure":
          config.database.connected = false;
          config.database.poolSize = 0;
          break;
        default:
          return;
      }
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      pushActivity("inject", "Config fault injected: " + type);
    } catch (e) {
      pushActivity("warn", "Inject failed: " + e.message);
    }
  }

  async function injectCodeBug(bugId) {
    var bug = CODE_BUGS[bugId];
    if (!bug) {
      pushActivity("warn", "Unknown bug id: " + bugId);
      return;
    }
    try {
      var r = await fetch("/api/code");
      var data = await r.json();
      var source = data.source;
      if (source.indexOf(bug.buggy) !== -1) {
        var resetResp = await fetch("/api/code/reset", { method: "POST" });
        var resetData = await resetResp.json();
        if (!resetData.ok) return;
        source = resetData.source;
        syncCodeFromServer(source, true);
      }
      if (source.indexOf(bug.target) === -1) {
        pushActivity("warn", "Cannot inject — reset worker and try again.");
        return;
      }
      var corrupted = source.replace(bug.target, bug.buggy);
      await fetch("/api/code", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: corrupted }),
      });
      syncCodeFromServer(corrupted, true);
      pushActivity("inject", "Code bug injected: " + bugId);
    } catch (e) {
      pushActivity("warn", "Code inject failed: " + e.message);
    }
  }

  async function saveConfig() {
    var ta = document.getElementById("breezy-config-editor");
    var err = document.getElementById("breezy-config-error");
    if (!ta) return;
    var parsed;
    try {
      parsed = JSON.parse(ta.value);
    } catch (e) {
      if (err) err.textContent = "Invalid JSON: " + e.message;
      ta.classList.add("ring-2", "ring-error");
      return;
    }
    ta.classList.remove("ring-2", "ring-error");
    if (err) err.textContent = "";
    try {
      var res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      configDirty = false;
      pushActivity("status", "Config saved");
    } catch (e) {
      if (err) err.textContent = e.message;
    }
  }

  async function saveCode() {
    var ta = document.getElementById("breezy-code-editor");
    var err = document.getElementById("breezy-code-error");
    if (!ta) return;
    try {
      var res = await fetch("/api/code", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: ta.value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      codeDirty = false;
      pushActivity("status", "worker-logic.ts saved");
    } catch (e) {
      if (err) err.textContent = e.message;
    }
  }

  async function resetCode() {
    try {
      var res = await fetch("/api/code/reset", { method: "POST" });
      var data = await res.json();
      if (data.source) syncCodeFromServer(data.source, true);
      pushActivity("status", "Lab reset — worker restored");
    } catch (e) {
      pushActivity("warn", "Reset failed: " + e.message);
    }
  }

  async function postCheck() {
    try {
      await fetch("/api/check", { method: "POST" });
    } catch (e) {}
  }

  function bindConfigEditor() {
    var ta = document.getElementById("breezy-config-editor");
    if (!ta) return;
    ta.addEventListener("input", function () {
      configDirty = true;
      try {
        JSON.parse(ta.value);
        ta.classList.remove("ring-2", "ring-error");
        var err = document.getElementById("breezy-config-error");
        if (err) err.textContent = "";
      } catch (e) {
        ta.classList.add("ring-2", "ring-error");
        var err2 = document.getElementById("breezy-config-error");
        if (err2) err2.textContent = e.message;
      }
    });
  }

  function bindCodeEditor() {
    var ta = document.getElementById("breezy-code-editor");
    if (!ta) return;
    ta.addEventListener("input", function () {
      codeDirty = true;
    });
  }

  function wireFaultButtons(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-breezy-fault]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        injectFault(btn.getAttribute("data-breezy-fault"));
      });
    });
  }

  function wireCodeBugButtons(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-breezy-code-bug]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        injectCodeBug(btn.getAttribute("data-breezy-code-bug"));
      });
    });
  }

  function init(page) {
    connectSSE();
    fetchInitial();

    if (page === "config") {
      bindConfigEditor();
      wireFaultButtons();
      var saveBtn = document.getElementById("breezy-save-config");
      var checkBtn = document.getElementById("breezy-check-config");
      if (saveBtn) saveBtn.addEventListener("click", saveConfig);
      if (checkBtn)
        checkBtn.addEventListener("click", function () {
          postCheck();
        });
      pushActivity("status", "Connected — listening for agent steps and server logs");
    }
    if (page === "code") {
      bindCodeEditor();
      wireCodeBugButtons();
      var saveC = document.getElementById("breezy-save-code");
      var resetC = document.getElementById("breezy-reset-lab");
      var deployC = document.getElementById("breezy-deploy-fix");
      if (saveC) saveC.addEventListener("click", saveCode);
      if (resetC) resetC.addEventListener("click", resetCode);
      if (deployC)
        deployC.addEventListener("click", function () {
          postCheck();
        });
      var fab = document.getElementById("breezy-fab-run");
      if (fab) fab.addEventListener("click", postCheck);
      document.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          saveCode();
        }
      });
      pushActivity("status", "Code lab connected — SSE log stream active");
    }
    if (page === "home") {
      /* static links only */
    }
  }

  global.Breezy = {
    init: init,
    PATHS: PATHS,
    injectFault: injectFault,
    injectCodeBug: injectCodeBug,
    postCheck: postCheck,
  };
})(typeof window !== "undefined" ? window : this);
