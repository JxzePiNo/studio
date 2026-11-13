"use client";
import { customStudyProgram, normalizeStudyProgram, searchStudyPrograms } from "@/lib/study-programs";
import { ProfileSuggestionInput } from "./profile-suggestion-input";

export function StudyProgramPicker({ id, value, onChange, disabled, autoFocus, ariaLabel = "Corso di laurea o ambito di studio" }: { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean; ariaLabel?: string }) {
  const results = searchStudyPrograms(value), custom = customStudyProgram(value);
  const canAdd = custom && !results.some(item => normalizeStudyProgram(item.label) === normalizeStudyProgram(custom));
  const suggestions = value.trim() ? results : [...results.slice(0, 4), ...results.filter(item => item.level !== "triennale").slice(0, 2)];
  const options = [...suggestions.slice(0, canAdd ? 5 : 6).map(item => ({ label: item.label, display: item.label })), ...(canAdd ? [{ label: custom, display: `Usa \u201c${custom}\u201d` }] : [])];
  return <ProfileSuggestionInput id={id} value={value} onChange={onChange} disabled={disabled} autoFocus={autoFocus} label={ariaLabel} listLabel="Suggerimenti dei corsi di laurea" placeholder="Cerca il tuo corso di laurea" maxLength={300} options={options} />;
}
