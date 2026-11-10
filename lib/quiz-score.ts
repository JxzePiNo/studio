export function quizResult(correct: number, total: number) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 0 || correct < 0 || correct > total) throw new RangeError("Punteggio del quiz non valido.");
  if (!total) return { percentage: null, grade: null, passed: false };
  const percentage = correct / total * 100;
  return { percentage, grade: Math.round(correct / total * 30), passed: percentage > 60 };
}
