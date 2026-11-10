import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export default async function setup() {
  const root = path.resolve("test-results/e2e-data");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "profile.json"), JSON.stringify({ studyProgram: "Ingegneria informatica", onboardingCompleted: true }));
}
