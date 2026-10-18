/**
 * ============================================================================
 * Esenho Android: Master Opaque-Box E2E Test Suite Aggregator
 * File: tests/test_e2e_opaque_box.js
 *
 * Runs all 4 test tiers:
 *   - Tier 1: Feature Coverage (F1–F24, >=5 tests each)
 *   - Tier 2: Boundary & Corner Cases (singularity & extreme values)
 *   - Tier 3: Cross-Feature Interactions (pairwise contracts)
 *   - Tier 4: Real-World Application Scenarios (end-to-end artist workflows)
 *
 * Authoritative References: ORIGINAL_REQUEST.md, PROJECT.md
 * ============================================================================
 */

const test = require('node:test');

console.log('======================================================================');
console.log('       Esenho Android: Complete Opaque-Box E2E Test Suite            ');
console.log('======================================================================');

// Import and run all 4 tiers
require('./e2e/test_tier1_features.js');
require('./e2e/test_tier2_boundaries.js');
require('./e2e/test_tier3_interactions.js');
require('./e2e/test_tier4_scenarios.js');
