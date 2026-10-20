export type ValidationResult = { valid: true } | { valid: false; errors: readonly string[] };

export type GeneratedValidator = ((value: unknown) => boolean) & {
  errors?: ReadonlyArray<{ instancePath: string; message?: string }> | null;
};

export function runValidator(validator: GeneratedValidator, value: unknown): ValidationResult {
  if (validator(value)) return { valid: true };
  const errors = (validator.errors ?? []).map(
    (error) =>
      `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? "is invalid"}`,
  );
  return { valid: false, errors };
}
