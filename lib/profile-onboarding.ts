import type { StudyProfile } from "./types";

export function needsProfileOnboarding(profile: StudyProfile) {
  return !profile.studyProgram.trim() || !profile.nickname?.trim() || !profile.university?.trim();
}
