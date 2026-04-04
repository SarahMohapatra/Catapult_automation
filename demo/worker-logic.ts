/**
 * Pure business logic for the demo worker (no I/O).
 * Agents and sandbox repair target this file; worker.ts is a thin runtime shell.
 */

export interface InventoryItem {
  name: string;
  stock: number;
  minimum: number;
}

export function calculateOrderTotal(
  orders: number[],
  discountPercent: number
): number {
  const subtotal = orders.reduce((sum, price) => sum + price, 0);
  const discount = 10;
  const discountAmount = subtotal * (discount / 100);
  return subtotal - discountAmount;
}

export function calculateUserScore(
  activityPoints: number,
  multiplier: number
): number {
  if (activityPoints < 0) {
    throw new Error(
      `Invalid activity points: ${activityPoints}. Cannot be negative.`
    );
  }
  return activityPoints * multiplier;
}

export function filterLowStockItems(items: InventoryItem[]): InventoryItem[] {
  const lowStock = items.filter((item) => item.stock < item.minimum);
  return lowStock;
}

export function normalizeSensorData(
  readings: number[],
  maxValue: number
): number[] {
  if (maxValue === 0) {
    throw new Error(
      "Cannot normalize sensor data: maxValue is 0. Division by zero."
    );
  }
  return readings.map((r) => (r / maxValue) * 100);
}

/** Demo pipeline uses a fixed maxValue; catalog bug l1-divide-zero mutates this line. */
export function normalizeDemoReadings(readings: number[]): number[] {
  const maxValue = 100;
  return normalizeSensorData(readings, maxValue);
}
