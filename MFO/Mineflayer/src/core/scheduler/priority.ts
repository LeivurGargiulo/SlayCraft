export const JobPriority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
} as const;

export type JobPriority = (typeof JobPriority)[keyof typeof JobPriority];
