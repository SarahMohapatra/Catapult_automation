/**
 * Polls demo/app.log for ERROR lines matching the payment API key failure.
 * Issue title MUST match server.ts detectIssues ("PaymentService API key missing")
 * so hasActiveTicketForIssue deduplicates with the config monitor.
 */
import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "demo/app.log");

export const PAYMENT_API_KEY_ISSUE_TITLE = "PaymentService API key missing";

export function buildPaymentIssueFromLogLine(line: string) {
  return {
    title: PAYMENT_API_KEY_ISSUE_TITLE,
    description: `Runtime error in demo app log:\n${line.trim()}\n\nRestore paymentService.apiKey in demo/config.json (e.g. pk_demo_abc123xyz).`,
    category: "config_corruption",
    suggestedTier: "L2" as const,
    verify: (c: any) => !!c.paymentService?.apiKey && c.paymentService.apiKey !== "",
  };
}

export function startDemoLogWatcher(options: {
  onPaymentErrorLine: (line: string) => void | Promise<void>;
  isPipelineBusy: () => boolean;
}): void {
  let lastReadPosition = 0;

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
  }
  try {
    lastReadPosition = fs.statSync(LOG_FILE).size;
  } catch {
    lastReadPosition = 0;
  }

  setInterval(() => {
    if (options.isPipelineBusy()) return;
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size < lastReadPosition) lastReadPosition = 0;
      if (stat.size === lastReadPosition) return;

      const fd = fs.openSync(LOG_FILE, "r");
      const buffer = Buffer.alloc(stat.size - lastReadPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastReadPosition);
      fs.closeSync(fd);
      lastReadPosition = stat.size;

      const newLines = buffer.toString("utf-8").split("\n").filter(Boolean);
      for (const line of newLines) {
        if (!line.includes("[ERROR]")) continue;
        if (!/PaymentService API key is missing/i.test(line)) continue;
        void options.onPaymentErrorLine(line);
        break;
      }
    } catch (e) {
      console.error("[demo-log-watcher]", e);
    }
  }, 3000);
}
