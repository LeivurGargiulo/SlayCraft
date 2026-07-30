/**
 * OFFLINE = manager disconnected; UNKNOWN = manager connected but this farm has never been
 * scanned yet. Reconciles ARCHITECTURE.md's 5-state list with TECHNICAL_SPEC.md's §13 decision
 * tree, which only ever names 4 outputs and folds "manager offline" into UNKNOWN — confirmed
 * with the user rather than picked silently, since both docs are supposed to be authoritative.
 */
export type FarmHealthStatus = 'UNKNOWN' | 'OFFLINE' | 'CRITICAL' | 'WARNING' | 'HEALTHY';
