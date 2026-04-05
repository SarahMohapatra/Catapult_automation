import * as fs from "fs";
import * as path from "path";
import {
  calculateOrderTotal,
  calculateUserScore,
  filterLowStockItems,
  normalizeDemoReadings,
  type InventoryItem,
} from "./worker-logic";

const LOG_FILE = path.join(__dirname, "worker.log");

function log(level: string, task: string, message: string) {
  const entry = `[${new Date().toISOString()}] [${level}] [${task}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(entry.trim());
}

function runOrderProcessor() {
  const orders = [120, 250, 89, 340, 75];
  const discountPercent = 10;
  const total = calculateOrderTotal(orders, discountPercent);

  if (total <= 0) {
    throw new Error(
      `Order total is invalid: ${total}. Expected positive number.`
    );
  }

  log(
    "INFO",
    "OrderProcessor",
    `Processed ${orders.length} orders. Total after ${discountPercent}% discount: $${total.toFixed(2)}`
  );
}

function runUserScoreCalculator() {
  const users = [
    { name: "Alice", points: 340, multiplier: 1.5 },
    { name: "Bob", points: 210, multiplier: 1.2 },
    { name: "Carol", points: 480, multiplier: 1.8 },
  ];

  for (const user of users) {
    const score = calculateUserScore(user.points, user.multiplier);
    log("INFO", "ScoreCalculator", `${user.name}: score = ${score.toFixed(1)}`);
  }
}

function checkInventory(items: InventoryItem[]) {
  const lowStock = filterLowStockItems(items);

  if (lowStock.length > 0) {
    log(
      "WARN",
      "InventoryChecker",
      `Low stock detected: ${lowStock.map((i) => i.name).join(", ")}`
    );
  } else {
    log(
      "INFO",
      "InventoryChecker",
      `All ${items.length} items above minimum stock level`
    );
  }
}

function runInventoryChecker() {
  const inventory: InventoryItem[] = [
    { name: "Widget A", stock: 150, minimum: 50 },
    { name: "Widget B", stock: 80, minimum: 100 },
    { name: "Widget C", stock: 200, minimum: 75 },
  ];
  checkInventory(inventory);
}

function runDataPipeline() {
  const readings = [45, 78, 23, 91, 56];
  const normalized = normalizeDemoReadings(readings);
  log(
    "INFO",
    "DataPipeline",
    `Normalized ${readings.length} sensor readings: [${normalized.map((n) => n.toFixed(1)).join(", ")}]`
  );
}

const tasks = [
  { name: "OrderProcessor", fn: runOrderProcessor },
  { name: "ScoreCalculator", fn: runUserScoreCalculator },
  { name: "InventoryChecker", fn: runInventoryChecker },
  { name: "DataPipeline", fn: runDataPipeline },
];

let cycle = 0;

async function main() {
  log("INFO", "Worker", "Worker started. Running task pipeline...");

  while (true) {
    cycle++;
    log("INFO", "Worker", `--- Cycle ${cycle} ---`);

    for (const task of tasks) {
      try {
        task.fn();
      } catch (err: any) {
        log("ERROR", task.name, err.message);
      }
    }

    await new Promise((r) => setTimeout(r, 4000));
  }
}

main();
