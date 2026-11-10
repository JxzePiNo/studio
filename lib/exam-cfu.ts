export function validExamCfu(value: number): boolean {
  return Number.isFinite(value) && value >= 0.5 && value <= 120 && Number.isInteger(value * 2);
}
