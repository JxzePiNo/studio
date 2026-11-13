"use client";
import { normalizeUniversity, searchUniversities } from "@/lib/universities";
import { ProfileSuggestionInput } from "./profile-suggestion-input";

export function UniversityPicker({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const results = searchUniversities(value), custom = value.trim();
  const canAdd = !!custom && custom.length <= 160 && !results.some(item => normalizeUniversity(item.label) === normalizeUniversity(custom));
  const options = [...results.slice(0, canAdd ? 5 : 6).map(item => ({ label: item.label, display: item.label })), ...(canAdd ? [{ label: custom, display: `Usa “${custom}”` }] : [])];
  return <ProfileSuggestionInput id={id} value={value} onChange={onChange} disabled={disabled} label="Università" listLabel="Suggerimenti delle università" placeholder="Cerca la tua università" maxLength={160} options={options} />;
}
