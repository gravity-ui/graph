/**
 * BlocksList Comparison Benchmark
 *
 * Run: node benchmarks/blocklist-comparison.bench.js
 *
 */

import isEqual from "lodash/isEqual.js";
import { bench, group, run } from "mitata";

// Mock BlockState structure
class BlockState {
  constructor(id) {
    this.id = id;
    this.data = { x: Math.random() * 1000, y: Math.random() * 1000 };
  }
}

// OLD METHOD: lodash.isEqual with sort
function oldComparison(newStates, oldStates) {
  return !isEqual(newStates.map((state) => state.id).sort(), oldStates.map((state) => state.id).sort());
}

// NEW METHOD: Set-based comparison
function newComparison(newStates, oldStates) {
  if (newStates.length !== oldStates.length) return true;

  const oldIds = new Set(oldStates.map((state) => state.id));
  return newStates.some((state) => !oldIds.has(state.id));
}

// Helper to create test data
function createBlocks(count) {
  return Array.from({ length: count }, (_, i) => new BlockState(`block-${i}`));
}

// Test scenarios
const scenarios = [
  { name: "10 blocks (small)", count: 10 },
  { name: "50 blocks (medium)", count: 50 },
  { name: "100 blocks (large)", count: 100 },
  { name: "500 blocks (very large)", count: 500 },
  { name: "1000 blocks (huge)", count: 1000 },
];

// Run benchmarks for each scenario
for (const scenario of scenarios) {
  const blocks1 = createBlocks(scenario.count);
  const blocks2 = [...blocks1]; // Same blocks
  const blocks3 = [...blocks1.slice(0, -1), new BlockState("block-changed")]; // One changed

  group(`${scenario.name} - No changes (equal)`, () => {
    bench("Old method (isEqual + sort)", () => {
      oldComparison(blocks1, blocks2);
    });

    bench("New method (Set-based)", () => {
      newComparison(blocks1, blocks2);
    });
  });

  group(`${scenario.name} - One block changed`, () => {
    bench("Old method (isEqual + sort)", () => {
      oldComparison(blocks1, blocks3);
    });

    bench("New method (Set-based)", () => {
      newComparison(blocks1, blocks3);
    });
  });
}

// Run all benchmarks
await run({
  units: false, // Don't show units in results
  silent: false, // Show output
  avg: true, // Show average time
  json: false, // Don't output JSON
  colors: true, // Use colors
  min_max: true, // Show min/max
  collect: false, // Don't collect gc
  percentiles: true, // Show percentiles
});
