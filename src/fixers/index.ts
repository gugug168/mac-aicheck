/**
 * Fixers barrel — re-exports all fixer types, registry, errors, verify, and orchestration.
 * Implementation details live in dedicated modules.
 */

// Import all fixers to trigger self-registration (side-effect)
import './homebrew';
import './git';
import './npm-mirror';
import './rosetta';
import './node-version';
import './python-versions';

// Re-export orchestrator (and its types for backward compatibility)
export {
  fixAll,
  type FixAllOptions,
  type FixAllResult,
  type FixerExecutionResult,
} from './orchestrator';

// Re-export all types
export type { Fixer, FixResult, FixerRisk, VerificationStatus, ErrorCategory } from './types';
export type { ScanResult } from '../scanners/types';

// Re-export registry functions
export {
  registerFixer,
  getFixers,
  getFixerById,
  getFixerForScanResult,
  getFixerByScannerId,
  clearFixers,
} from './registry';

// Re-export error functions
export { classifyError, ERROR_MESSAGES } from './errors';
export type { ClassifiedError } from './errors';

// Re-export verify functions
export { verifyFix, determineVerificationStatus, preflightCheck, buildNextSteps } from './verify';
