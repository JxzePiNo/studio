"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { invalidateApiCache } from "@/lib/browser-data-cache";
import type { SavedQuizResult, StudyQuiz } from "@/lib/quiz";

export function useQuizResult(quiz: StudyQuiz, answers: Record<string, string>, finished: boolean, ready: boolean) {
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");
  const [retry, setRetry] = useState(0);
  const requests = useRef(new Map<string, Promise<SavedQuizResult>>());
  const serialized = JSON.stringify(answers);
  useEffect(() => {
    if (!ready || !finished) return;
    let active = true;
    const key = `${quiz.id}:${serialized}`;
    let task = requests.current.get(key);
    if (!task) {
      setStatus("saving");
      task = (async () => {
        const response = await fetch(`/api/documents/${quiz.documentId}/quiz/${quiz.id}/result`, { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ answers: JSON.parse(serialized) }) });
        const result = await readApiResponse<SavedQuizResult>(response);
        await invalidateApiCache(`/api/documents/${quiz.documentId}/quiz`, `/api/documents/${quiz.documentId}/quiz/${quiz.id}`);
        window.dispatchEvent(new CustomEvent("studio-quizzes-changed", { detail: { documentId: quiz.documentId, quizId: quiz.id, result } }));
        return result;
      })();
      requests.current.set(key, task);
    }
    void task.then(() => { if (active) setStatus("saved"); }).catch(() => { requests.current.delete(key); if (active) setStatus("error"); });
    return () => { active = false; };
  }, [quiz.id, quiz.documentId, serialized, finished, ready, retry]);
  return { status, retry: () => setRetry(value => value + 1) };
}
