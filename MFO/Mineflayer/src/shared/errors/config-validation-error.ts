export class ConfigValidationError extends Error {
  public readonly filePath: string;
  public readonly issues: readonly string[];

  constructor(filePath: string, issues: readonly string[]) {
    super(
      `Invalid configuration in ${filePath}:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'ConfigValidationError';
    this.filePath = filePath;
    this.issues = issues;
  }
}
