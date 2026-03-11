import {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

interface ValidationEntry {
  status: "passed" | "failed";
  message: string;
  actual?: unknown;
  expected?: unknown;
}

interface RequestDetails {
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number>;
  body?: unknown;
}

interface ResponseDetails {
  status: number;
  data: unknown;
}

interface TestEntry {
  suite: string;
  name: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  duration: number;
  error?: string;
  retries: number;
  validations: ValidationEntry[];
  request?: RequestDetails;
  response?: ResponseDetails;
  extractedVars?: Record<string, string>;
}

class CustomHtmlReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime: number = 0;

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const suiteName = test.parent?.title || "Ungrouped";

    let validations: ValidationEntry[] = [];
    let request: RequestDetails | undefined;
    let response: ResponseDetails | undefined;
    let extractedVars: Record<string, string> | undefined;

    for (const attachment of result.attachments) {
      if (attachment.body) {
        try {
          if (attachment.name === "validation-results") {
            validations = JSON.parse(attachment.body.toString());
          } else if (attachment.name === "request-details") {
            request = JSON.parse(attachment.body.toString());
          } else if (attachment.name === "response-body") {
            response = JSON.parse(attachment.body.toString());
          } else if (attachment.name === "extracted-variables") {
            extractedVars = JSON.parse(attachment.body.toString());
          }
        } catch {}
      }
    }

    this.tests.push({
      suite: suiteName,
      name: test.title,
      status: result.status as TestEntry["status"],
      duration: result.duration,
      error: result.errors?.map((e) => this.stripAnsi(e.message || e.toString())).join("\n"),
      retries: result.retry,
      validations,
      request,
      response,
      extractedVars,
    });
  }

  onEnd(result: FullResult) {
    const finalTests = new Map<string, TestEntry>();
    for (const t of this.tests) {
      const key = `${t.suite}::${t.name}`;
      finalTests.set(key, t);
    }
    const tests = Array.from(finalTests.values());

    const totalDuration = Date.now() - this.startTime;
    const passed = tests.filter((t) => t.status === "passed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    const skipped = tests.filter((t) => t.status === "skipped").length;
    const total = tests.length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    const suites = new Map<string, TestEntry[]>();
    for (const t of tests) {
      if (!suites.has(t.suite)) suites.set(t.suite, []);
      suites.get(t.suite)!.push(t);
    }

    const html = this.generateHtml({
      tests, suites, passed, failed, skipped, total, passRate, totalDuration,
      overallStatus: result.status,
      timestamp: new Date().toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }),
    });

    const outDir = path.resolve("playwright-report");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf-8");
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\u001b\[[0-9;]*m/g, "");
  }

  private generateHtml(data: {
    tests: TestEntry[];
    suites: Map<string, TestEntry[]>;
    passed: number; failed: number; skipped: number; total: number;
    passRate: number; totalDuration: number; overallStatus: string; timestamp: string;
  }): string {
    const { suites, passed, failed, skipped, total, passRate, totalDuration, overallStatus, timestamp } = data;

    const formatDuration = (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    };

    const statusIcon = (status: string) => {
      switch (status) {
        case "passed": return `<span class="status-icon pass">&#10004;</span>`;
        case "failed": return `<span class="status-icon fail">&#10006;</span>`;
        case "timedOut": return `<span class="status-icon fail">&#9202;</span>`;
        case "skipped": return `<span class="status-icon skip">&#9644;</span>`;
        default: return "";
      }
    };

    const statusLabel = (status: string) => {
      switch (status) {
        case "passed": return `<span class="badge badge-pass">PASSED</span>`;
        case "failed": return `<span class="badge badge-fail">FAILED</span>`;
        case "timedOut": return `<span class="badge badge-fail">TIMED OUT</span>`;
        case "skipped": return `<span class="badge badge-skip">SKIPPED</span>`;
        default: return "";
      }
    };

    const jsonBlock = (obj: unknown, maxLines = 20): string => {
      const str = JSON.stringify(obj, null, 2);
      const lines = str.split("\n");
      const truncated = lines.length > maxLines;
      const display = truncated ? lines.slice(0, maxLines).join("\n") + "\n  ..." : str;
      return `<pre class="json-block"><code>${this.escapeHtml(display)}</code></pre>${truncated ? `<button class="expand-btn" onclick="this.previousElementSibling.querySelector('code').textContent=JSON.stringify(JSON.parse(this.dataset.full),null,2);this.remove()" data-full='${this.escapeHtml(JSON.stringify(obj))}'>Show full (${lines.length} lines)</button>` : ""}`;
    };

    let suitesHtml = "";
    let suiteIndex = 0;
    for (const [suiteName, tests] of suites) {
      const suitePassed = tests.filter((t) => t.status === "passed").length;
      const suiteFailed = tests.filter((t) => t.status === "failed").length;
      const suiteSkipped = tests.filter((t) => t.status === "skipped").length;
      const suiteTotal = tests.length;
      const suitePassRate = suiteTotal > 0 ? Math.round((suitePassed / suiteTotal) * 100) : 0;
      const suiteStatus = suiteFailed > 0 ? "fail" : "pass";

      let testsHtml = "";
      tests.forEach((t, i) => {
        // Validation rows
        let validationsHtml = "";
        if (t.validations.length > 0) {
          const vPassed = t.validations.filter((v) => v.status === "passed").length;
          const vFailed = t.validations.filter((v) => v.status === "failed").length;
          const vTotal = t.validations.length;

          const validationRows = t.validations.map((v) => {
            const icon = v.status === "passed"
              ? `<span class="v-icon v-pass">&#10004;</span>`
              : `<span class="v-icon v-fail">&#10006;</span>`;
            let details = "";
            if (v.status === "failed") {
              const parts: string[] = [];
              if (v.expected !== undefined) parts.push(`Expected: <strong>${this.escapeHtml(JSON.stringify(v.expected))}</strong>`);
              if (v.actual !== undefined) parts.push(`Actual: <strong>${this.escapeHtml(JSON.stringify(v.actual))}</strong>`);
              if (parts.length > 0) details = `<div class="v-details">${parts.join(" &nbsp;|&nbsp; ")}</div>`;
            }
            return `<div class="v-row ${v.status}"><div class="v-main">${icon}<span class="v-message">${this.escapeHtml(v.message)}</span></div>${details}</div>`;
          }).join("");

          validationsHtml = `
            <div class="validations-block">
              <div class="validations-header"><span class="validations-title">Validations</span>
                <span class="validations-summary"><span class="v-count-pass">${vPassed} passed</span>${vFailed > 0 ? `<span class="v-count-fail">${vFailed} failed</span>` : ""}<span class="v-count-total">${vTotal} total</span></span>
              </div>${validationRows}
            </div>`;
        }

        // Request details
        let requestHtml = "";
        if (t.request) {
          const r = t.request;
          const qp = r.queryParams ? "?" + Object.entries(r.queryParams).map(([k, v]) => `${k}=${v}`).join("&") : "";
          const fullUrl = `${this.escapeHtml(r.method)} ${this.escapeHtml(r.endpoint)}${this.escapeHtml(qp)}`;
          const bodyParts: string[] = [];
          bodyParts.push(`<div class="detail-sub-label">URL</div><pre class="json-block"><code>${fullUrl}</code></pre>`);
          if (r.headers && Object.keys(r.headers).length > 0) {
            bodyParts.push(`<div class="detail-sub-label">Headers</div>${jsonBlock(r.headers)}`);
          }
          if (r.body) {
            bodyParts.push(`<div class="detail-sub-label">Body</div>${jsonBlock(r.body)}`);
          }
          if (r.queryParams && Object.keys(r.queryParams).length > 0) {
            bodyParts.push(`<div class="detail-sub-label">Query Parameters</div>${jsonBlock(r.queryParams)}`);
          }
          requestHtml = `
            <div class="detail-section">
              <div class="detail-section-header" onclick="event.stopPropagation(); this.parentElement.classList.toggle('open')">
                <span><span class="section-arrow">&#9654;</span> Request</span><span class="detail-tag">${fullUrl}</span>
              </div>
              <div class="detail-section-body">${bodyParts.join("")}</div>
            </div>`;
        }

        // Response details
        let responseHtml = "";
        if (t.response) {
          responseHtml = `
            <div class="detail-section">
              <div class="detail-section-header" onclick="event.stopPropagation(); this.parentElement.classList.toggle('open')">
                <span><span class="section-arrow">&#9654;</span> Response</span><span class="detail-tag status-${t.response.status >= 200 && t.response.status < 300 ? "ok" : "err"}">${t.response.status}</span>
              </div>
              <div class="detail-section-body">${jsonBlock(t.response.data)}</div>
            </div>`;
        }

        // Extracted variables
        let extractHtml = "";
        if (t.extractedVars && Object.keys(t.extractedVars).length > 0) {
          const rows = Object.entries(t.extractedVars).map(([k, v]) =>
            `<tr><td class="extract-key">{{${this.escapeHtml(k)}}}</td><td class="extract-arrow">&#8592;</td><td>${this.escapeHtml(v)}</td></tr>`
          ).join("");
          extractHtml = `<div class="extract-block"><div class="extract-title">Extracted Variables</div><table>${rows}</table></div>`;
        }

        const retriesHtml = t.retries > 0 ? `<span class="retries-badge">Retry #${t.retries}</span>` : "";

        testsHtml += `
          <div class="test-row ${t.status}" onclick="toggleDetail('suite${suiteIndex}-test${i}')">
            <div class="test-main">
              <div class="test-left">${statusIcon(t.status)}<span class="test-name">${this.escapeHtml(t.name)}</span>${retriesHtml}</div>
              <div class="test-right">${statusLabel(t.status)}<span class="test-duration">${formatDuration(t.duration)}</span></div>
            </div>
            <div class="test-detail" id="suite${suiteIndex}-test${i}" onclick="event.stopPropagation()">
              <table class="detail-table">
                <tr><td class="detail-label">Test Name</td><td>${this.escapeHtml(t.name)}</td></tr>
                <tr><td class="detail-label">Status</td><td>${t.status.toUpperCase()}</td></tr>
                <tr><td class="detail-label">Duration</td><td>${formatDuration(t.duration)}</td></tr>
                <tr><td class="detail-label">Retries</td><td>${t.retries}</td></tr>
              </table>
              ${requestHtml}
              ${responseHtml}
              ${extractHtml}
              ${validationsHtml}
            </div>
          </div>`;
      });

      suitesHtml += `
        <div class="suite-card">
          <div class="suite-header" onclick="toggleSuite('suite-body-${suiteIndex}')">
            <div class="suite-header-left">
              <span class="suite-chevron" id="chevron-suite-body-${suiteIndex}">&#9660;</span>
              <span class="suite-status-dot ${suiteStatus}"></span>
              <h3 class="suite-title">${this.escapeHtml(suiteName)}</h3>
            </div>
            <div class="suite-header-right">
              <span class="suite-stat pass-text">${suitePassed} passed</span>
              ${suiteFailed > 0 ? `<span class="suite-stat fail-text">${suiteFailed} failed</span>` : ""}
              ${suiteSkipped > 0 ? `<span class="suite-stat skip-text">${suiteSkipped} skipped</span>` : ""}
              <span class="suite-stat muted-text">${suiteTotal} total</span>
              <div class="mini-bar"><div class="mini-bar-fill" style="width: ${suitePassRate}%"></div></div>
            </div>
          </div>
          <div class="suite-body" id="suite-body-${suiteIndex}">${testsHtml}</div>
        </div>`;
      suiteIndex++;
    }

    return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Test Report</title>
  <style>
    :root, [data-theme="light"] {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #1e293b;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --hover-bg: #f8fafc;
      --code-bg: #f1f5f9;
      --header-bg: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      --header-text: #ffffff;
      --header-subtitle: #94a3b8;
      --card-glass: rgba(255,255,255,0.1);
      --pass: #22c55e;
      --pass-bg: #f0fdf4;
      --pass-border: #bbf7d0;
      --fail: #ef4444;
      --fail-bg: #fef2f2;
      --fail-border: #fecaca;
      --skip: #f59e0b;
      --skip-bg: #fffbeb;
      --skip-border: #fde68a;
      --accent: #3b82f6;
      --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
      --shadow-lg: 0 4px 16px rgba(0,0,0,0.1);
      --radius: 12px;
      --progress-track: #f1f5f9;
      --detail-fail-bg: rgba(239, 68, 68, 0.06);
      --detail-fail-text: #991b1b;
    }

    [data-theme="dark"] {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #e2e8f0;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --hover-bg: #263348;
      --code-bg: #0f172a;
      --header-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      --header-text: #f1f5f9;
      --header-subtitle: #64748b;
      --card-glass: rgba(255,255,255,0.05);
      --pass: #4ade80;
      --pass-bg: rgba(34,197,94,0.1);
      --pass-border: rgba(34,197,94,0.3);
      --fail: #f87171;
      --fail-bg: rgba(239,68,68,0.1);
      --fail-border: rgba(239,68,68,0.3);
      --skip: #fbbf24;
      --skip-bg: rgba(245,158,11,0.1);
      --skip-border: rgba(245,158,11,0.3);
      --accent: #60a5fa;
      --shadow: 0 1px 3px rgba(0,0,0,0.3);
      --shadow-lg: 0 4px 16px rgba(0,0,0,0.4);
      --progress-track: #334155;
      --detail-fail-bg: rgba(239, 68, 68, 0.12);
      --detail-fail-text: #fca5a5;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh;
      transition: background 0.3s, color 0.3s;
    }

    .header {
      background: var(--header-bg); color: var(--header-text); padding: 32px 0;
    }

    .header-content { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

    .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .header-top-left { display: flex; align-items: center; gap: 12px; }

    .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .header-subtitle { font-size: 14px; color: var(--header-subtitle); margin-top: 4px; }

    .theme-toggle {
      background: var(--card-glass); border: 1px solid rgba(255,255,255,0.15);
      color: white; width: 40px; height: 40px; border-radius: 10px;
      cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .theme-toggle:hover { background: rgba(255,255,255,0.2); }

    .overall-badge {
      padding: 6px 20px; border-radius: 20px; font-weight: 700;
      font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .overall-pass { background: var(--pass); color: white; }
    .overall-fail { background: var(--fail); color: white; }

    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }

    .summary-card {
      background: var(--card-glass); border-radius: 10px;
      padding: 16px 20px; text-align: center; backdrop-filter: blur(10px);
    }
    .summary-card .number { font-size: 36px; font-weight: 800; line-height: 1.1; }
    .summary-card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--header-subtitle); margin-top: 4px; }
    .number-total { color: white; }
    .number-pass { color: var(--pass); }
    .number-fail { color: var(--fail); }
    .number-skip { color: var(--skip); }
    .number-rate { color: var(--accent); }

    .progress-section { max-width: 1100px; margin: -20px auto 0; padding: 0 24px; position: relative; z-index: 1; }
    .progress-card { background: var(--surface); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow-lg); border: 1px solid var(--border); }
    .progress-bar-container { display: flex; align-items: center; gap: 16px; }
    .progress-bar { flex: 1; height: 28px; background: var(--progress-track); border-radius: 14px; overflow: hidden; display: flex; }
    .progress-fill-pass { background: linear-gradient(90deg, #22c55e, #4ade80); height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 12px; }
    .progress-fill-fail { background: linear-gradient(90deg, #ef4444, #f87171); height: 100%; }
    .progress-fill-skip { background: linear-gradient(90deg, #f59e0b, #fbbf24); height: 100%; }
    .progress-legend { display: flex; gap: 24px; margin-top: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .legend-dot.pass { background: var(--pass); }
    .legend-dot.fail { background: var(--fail); }
    .legend-dot.skip { background: var(--skip); }

    .filter-bar { max-width: 1100px; margin: 24px auto 0; padding: 0 24px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .filter-label { font-size: 13px; color: var(--text-muted); font-weight: 600; margin-right: 4px; }
    .filter-btn {
      padding: 6px 16px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--surface); font-size: 13px; cursor: pointer;
      color: var(--text-secondary); font-weight: 500; transition: all 0.2s;
    }
    .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
    .filter-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
    .search-input {
      margin-left: auto; padding: 6px 16px; border-radius: 20px;
      border: 1px solid var(--border); font-size: 13px; outline: none; width: 220px;
      background: var(--surface); color: var(--text);
    }
    .search-input:focus { border-color: var(--accent); }

    .suites-container { max-width: 1100px; margin: 24px auto; padding: 0 24px 48px; }

    .suite-card { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 16px; overflow: hidden; border: 1px solid var(--border); }
    .suite-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; cursor: pointer; user-select: none; transition: background 0.15s; }
    .suite-header:hover { background: var(--hover-bg); }
    .suite-header-left { display: flex; align-items: center; gap: 12px; }
    .suite-chevron { font-size: 12px; color: var(--text-muted); transition: transform 0.2s; }
    .suite-chevron.collapsed { transform: rotate(-90deg); }
    .suite-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .suite-status-dot.pass { background: var(--pass); }
    .suite-status-dot.fail { background: var(--fail); }
    .suite-title { font-size: 16px; font-weight: 600; }
    .suite-header-right { display: flex; align-items: center; gap: 16px; }
    .suite-stat { font-size: 13px; font-weight: 500; }
    .pass-text { color: var(--pass); }
    .fail-text { color: var(--fail); }
    .skip-text { color: var(--skip); }
    .muted-text { color: var(--text-muted); }
    .mini-bar { width: 80px; height: 6px; background: var(--progress-track); border-radius: 3px; overflow: hidden; }
    .mini-bar-fill { height: 100%; background: var(--pass); border-radius: 3px; }
    .suite-body { padding: 0; }
    .suite-body.hidden { display: none; }

    .test-row { border-top: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
    .test-row:hover { background: var(--hover-bg); }
    .test-row.failed { border-left: 3px solid var(--fail); }
    .test-row.passed { border-left: 3px solid var(--pass); }
    .test-row.skipped { border-left: 3px solid var(--skip); }
    .test-row.timedOut { border-left: 3px solid var(--fail); }
    .test-main { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; }
    .test-left { display: flex; align-items: center; gap: 10px; flex: 1; }
    .test-right { display: flex; align-items: center; gap: 12px; }
    .status-icon { font-size: 16px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; }
    .status-icon.pass { color: var(--pass); background: var(--pass-bg); }
    .status-icon.fail { color: var(--fail); background: var(--fail-bg); }
    .status-icon.skip { color: var(--skip); background: var(--skip-bg); }
    .test-name { font-size: 14px; font-weight: 500; }
    .retries-badge { font-size: 11px; padding: 1px 8px; border-radius: 10px; background: var(--skip-bg); color: #92400e; font-weight: 600; }
    .badge { padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; }
    .badge-pass { background: var(--pass-bg); color: var(--pass); border: 1px solid var(--pass-border); }
    .badge-fail { background: var(--fail-bg); color: var(--fail); border: 1px solid var(--fail-border); }
    .badge-skip { background: var(--skip-bg); color: var(--skip); border: 1px solid var(--skip-border); }
    .test-duration { font-size: 13px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
    .test-detail { display: none; padding: 0 24px 16px; animation: slideDown 0.2s ease; }
    .test-detail.open { display: block; }
    .test-detail * { cursor: default; }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .detail-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
    .detail-table td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
    .detail-label { font-weight: 600; color: var(--text-secondary); width: 120px; }

    /* Request/Response sections */
    .detail-section { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
    .detail-section-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 14px; background: var(--code-bg); cursor: pointer;
      font-size: 13px; font-weight: 600; color: var(--text-secondary); user-select: none;
    }
    .detail-section-header:hover { background: var(--hover-bg); }
    .detail-section-body { display: none; padding: 10px 14px; }
    .detail-section.open .detail-section-body { display: block; }
    .section-arrow { display: inline-block; transition: transform 0.15s; font-size: 10px; }
    .detail-section.open .section-arrow { transform: rotate(90deg); }
    .detail-sub-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px; margin-top: 8px; }
    .detail-sub-label:first-child { margin-top: 0; }
    .detail-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: var(--code-bg); font-family: monospace; }
    .detail-tag.status-ok { color: var(--pass); }
    .detail-tag.status-err { color: var(--fail); }

    .json-block {
      background: var(--code-bg); border-radius: 6px; padding: 10px 14px;
      font-size: 12px; font-family: 'Cascadia Code', 'Fira Code', 'SF Mono', monospace;
      overflow-x: auto; white-space: pre; line-height: 1.5; border: 1px solid var(--border);
      color: var(--text);
    }
    .expand-btn {
      background: none; border: none; color: var(--accent); font-size: 12px;
      cursor: pointer; padding: 4px 0; font-weight: 500;
    }
    .expand-btn:hover { text-decoration: underline; }

    /* Extracted variables */
    .extract-block { border: 1px solid var(--pass-border); border-radius: 8px; margin-bottom: 8px; overflow: hidden; background: var(--pass-bg); }
    .extract-title { padding: 6px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--pass); }
    .extract-block table { width: 100%; font-size: 13px; border-collapse: collapse; }
    .extract-block td { padding: 4px 14px; }
    .extract-key { font-family: monospace; font-weight: 600; color: var(--accent); }
    .extract-arrow { width: 30px; text-align: center; color: var(--text-muted); }

    /* Validation Breakdown */
    .validations-block { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-top: 8px; }
    .validations-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: var(--code-bg); border-bottom: 1px solid var(--border);
    }
    .validations-title { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
    .validations-summary { display: flex; gap: 12px; font-size: 12px; font-weight: 600; }
    .v-count-pass { color: var(--pass); }
    .v-count-fail { color: var(--fail); }
    .v-count-total { color: var(--text-muted); }
    .v-row { padding: 8px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
    .v-row:last-child { border-bottom: none; }
    .v-row.passed { background: var(--surface); }
    .v-row.failed { background: var(--fail-bg); }
    .v-main { display: flex; align-items: center; gap: 8px; }
    .v-icon { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px; flex-shrink: 0; }
    .v-pass { color: var(--pass); background: var(--pass-bg); border: 1px solid var(--pass-border); }
    .v-fail { color: var(--fail); background: var(--fail-bg); border: 1px solid var(--fail-border); }
    .v-message { font-weight: 500; }
    .v-details { margin: 6px 0 2px 28px; padding: 6px 12px; background: var(--detail-fail-bg); border-radius: 6px; font-size: 12px; color: var(--detail-fail-text); font-family: 'Cascadia Code', 'Fira Code', monospace; }

    .footer { text-align: center; padding: 24px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); max-width: 1100px; margin: 0 auto; }

    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: repeat(3, 1fr); }
      .summary-card .number { font-size: 28px; }
      .suite-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .test-main { flex-direction: column; align-items: flex-start; gap: 8px; }
      .filter-bar { flex-direction: column; align-items: flex-start; }
      .search-input { width: 100%; margin-left: 0; }
    }

    @media print {
      .header { background: #1e293b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .filter-bar, .theme-toggle { display: none; }
      .test-detail { display: block !important; }
      .suite-body { display: block !important; }
      .detail-section-body { display: block !important; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-content">
      <div class="header-top">
        <div>
          <div class="header-top-left">
            <h1>API Test Report</h1>
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark/light theme">&#9790;</button>
          </div>
          <div class="header-subtitle">${timestamp}</div>
        </div>
        <span class="overall-badge ${overallStatus === "passed" ? "overall-pass" : "overall-fail"}">
          ${overallStatus === "passed" ? "ALL PASSED" : "HAS FAILURES"}
        </span>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><div class="number number-total">${total}</div><div class="label">Total Tests</div></div>
        <div class="summary-card"><div class="number number-pass">${passed}</div><div class="label">Passed</div></div>
        <div class="summary-card"><div class="number number-fail">${failed}</div><div class="label">Failed</div></div>
        <div class="summary-card"><div class="number number-skip">${skipped}</div><div class="label">Skipped</div></div>
        <div class="summary-card"><div class="number number-rate">${passRate}%</div><div class="label">Pass Rate</div></div>
      </div>
    </div>
  </div>

  <div class="progress-section">
    <div class="progress-card">
      <div class="progress-bar-container">
        <div class="progress-bar">
          <div class="progress-fill-pass" style="width: ${total > 0 ? (passed / total) * 100 : 0}%">${passRate > 15 ? passRate + "%" : ""}</div>
          <div class="progress-fill-fail" style="width: ${total > 0 ? (failed / total) * 100 : 0}%"></div>
          <div class="progress-fill-skip" style="width: ${total > 0 ? (skipped / total) * 100 : 0}%"></div>
        </div>
        <span style="font-size: 14px; color: var(--text-muted); white-space: nowrap;">${formatDuration(totalDuration)}</span>
      </div>
      <div class="progress-legend">
        <div class="legend-item"><span class="legend-dot pass"></span> Passed (${passed})</div>
        <div class="legend-item"><span class="legend-dot fail"></span> Failed (${failed})</div>
        <div class="legend-item"><span class="legend-dot skip"></span> Skipped (${skipped})</div>
      </div>
    </div>
  </div>

  <div class="filter-bar">
    <span class="filter-label">Filter:</span>
    <button class="filter-btn active" onclick="filterTests('all')">All (${total})</button>
    <button class="filter-btn" onclick="filterTests('passed')">Passed (${passed})</button>
    <button class="filter-btn" onclick="filterTests('failed')">Failed (${failed})</button>
    ${skipped > 0 ? `<button class="filter-btn" onclick="filterTests('skipped')">Skipped (${skipped})</button>` : ""}
    <input type="text" class="search-input" placeholder="Search tests..." oninput="searchTests(this.value)">
  </div>

  <div class="suites-container">${suitesHtml}</div>

  <div class="footer">API Test Report &bull; Generated by Playwright API Automation Framework</div>

  <script>
    // Theme toggle
    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('report-theme', next);
      document.querySelector('.theme-toggle').textContent = next === 'dark' ? '\\u2600' : '\\u263E';
    }
    (function() {
      const saved = localStorage.getItem('report-theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        if (saved === 'dark') document.querySelector('.theme-toggle').textContent = '\\u2600';
      }
    })();

    function toggleDetail(id) {
      event.stopPropagation();
      document.getElementById(id)?.classList.toggle('open');
    }

    function toggleSuite(id) {
      document.getElementById(id)?.classList.toggle('hidden');
      document.getElementById('chevron-' + id)?.classList.toggle('collapsed');
    }

    function filterTests(status) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('.test-row').forEach(row => {
        row.style.display = status === 'all' || row.classList.contains(status) ? '' : 'none';
      });
      document.querySelectorAll('.suite-card').forEach(suite => {
        suite.style.display = suite.querySelectorAll('.test-row:not([style*="display: none"])').length > 0 ? '' : 'none';
      });
    }

    function searchTests(query) {
      const q = query.toLowerCase();
      document.querySelectorAll('.test-row').forEach(row => {
        row.style.display = (row.querySelector('.test-name')?.textContent?.toLowerCase() || '').includes(q) ? '' : 'none';
      });
      document.querySelectorAll('.suite-card').forEach(suite => {
        suite.style.display = suite.querySelectorAll('.test-row:not([style*="display: none"])').length > 0 ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

export default CustomHtmlReporter;
