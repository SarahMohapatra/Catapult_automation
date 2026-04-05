/**
 * Canonical demo worker logic — source of truth for "Reset" / full system reset.
 * demo/worker-logic.ts is overwritten at runtime; this file should stay committed.
 */
export type InventoryItem = {
  name: string;
  stock: number;
  minimum: number;
};

export function calculateOrderTotal(
  orders: number[],
  discountPercent: number
): number {
  const subtotal = orders.reduce((sum, price) => sum + price, 0);
  const discount = 10;
  const total = subtotal * (1 - discount / 100);
  if (total <= 0) {
    throw new Error("Order total is invalid");
  }
  return total;
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

export function normalizeDemoReadings(readings: number[]): number[] {
  const maxValue = 100;
  return normalizeSensorData(readings, maxValue);
}

export function calculateUserScore(
  activityPoints: number,
  multiplier: number
): number {
  if (activityPoints < 0) {
    throw new Error("Invalid activity points");
  }
  return activityPoints * multiplier;
}

export function filterLowStockItems(
  items: InventoryItem[]
): InventoryItem[] {
  const lowStock = items.filter((item) => item.stock < item.minimum);
  return lowStock;
}
