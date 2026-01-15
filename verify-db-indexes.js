// MongoDB Index Verification Script
// Run this in MongoDB shell: meteor mongo < verify-db-indexes.js
// Or copy-paste into meteor mongo shell

print("🔍 Verifying Database Indexes");
print("==============================\n");

// Switch to meteor database
use meteor;

print("Checking jr_subscribers collection indexes...\n");

const indexes = db.jr_subscribers.getIndexes();

print("Found " + indexes.length + " indexes:\n");

let foundCompoundIndex = false;
let foundNameIndex = false;

indexes.forEach(function(index) {
  const keys = Object.keys(index.key).map(k => k + ": " + index.key[k]).join(", ");
  print("  • " + index.name + " → { " + keys + " }");

  // Check for our new compound index
  if (index.name === "name_1_user_1") {
    foundCompoundIndex = true;
  }

  if (index.name === "name_1") {
    foundNameIndex = true;
  }
});

print("\n" + "=".repeat(50) + "\n");

// Verification results
if (foundCompoundIndex) {
  print("✅ PASS: Compound index (name_1_user_1) exists");
} else {
  print("❌ FAIL: Compound index (name_1_user_1) NOT found");
  print("\n💡 Fix: Restart the Meteor server to auto-create indexes");
  print("   Or manually create:");
  print("   db.jr_subscribers.createIndex({ name: 1, user: 1 })");
}

if (foundNameIndex) {
  print("✅ PASS: Single-field index (name_1) exists");
} else {
  print("⚠️  WARN: Single-field index (name_1) NOT found");
}

print("\n" + "=".repeat(50) + "\n");

// Check index usage statistics (if available)
print("Index statistics (sample queries):\n");

// Query 1: Find by name (uses name_1 or name_1_user_1)
const explainByName = db.jr_subscribers.find({ name: "puzzle:test123" }).explain("executionStats");
if (explainByName.executionStats) {
  print("  Query: find({ name: 'puzzle:test123' })");
  print("  • Winning plan: " + (explainByName.queryPlanner.winningPlan.inputStage ? explainByName.queryPlanner.winningPlan.inputStage.indexName : "N/A"));
  print("  • Docs examined: " + explainByName.executionStats.totalDocsExamined);
  print("  • Docs returned: " + explainByName.executionStats.nReturned);
  print();
}

// Query 2: Find by name and user (should use name_1_user_1)
const explainByBoth = db.jr_subscribers.find({ name: "puzzle:test123", user: "user456" }).explain("executionStats");
if (explainByBoth.executionStats) {
  print("  Query: find({ name: 'puzzle:test123', user: 'user456' })");
  print("  • Winning plan: " + (explainByBoth.queryPlanner.winningPlan.inputStage ? explainByBoth.queryPlanner.winningPlan.inputStage.indexName : "N/A"));
  print("  • Docs examined: " + explainByBoth.executionStats.totalDocsExamined);
  print("  • Docs returned: " + explainByBoth.executionStats.nReturned);

  // Verify compound index is being used
  if (explainByBoth.queryPlanner.winningPlan.inputStage && explainByBoth.queryPlanner.winningPlan.inputStage.indexName === "name_1_user_1") {
    print("  ✅ Compound index is being used!");
  } else {
    print("  ⚠️  Compound index is NOT being used (check query patterns)");
  }
  print();
}

print("=".repeat(50));
print("\n📊 Summary:");
print("  - Total indexes: " + indexes.length);
print("  - Compound index: " + (foundCompoundIndex ? "✅ Present" : "❌ Missing"));
print("  - Single name index: " + (foundNameIndex ? "✅ Present" : "❌ Missing"));

print("\n💡 Tip: For real-time monitoring, use:");
print("   db.currentOp() - See active operations");
print("   db.jr_subscribers.stats() - Collection statistics");
print("\n");
