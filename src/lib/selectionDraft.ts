import {isValidSelection, type Selection} from './selection';

export interface SelectionDraft {
  id: string;
  createdAt: string;
  spreadId: string;
  question: string;
  allowReversed: boolean;
  selection: Selection;
}

// Each tab gets its own unfinished spread. Only confirmed readings go in the journal.
const draftKey = 'grey-fog-tarot.selection.v1';

export function loadSelectionDraft(): SelectionDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' ||
        typeof draft.id !== 'string' || !/^[\da-f-]{36}$/i.test(draft.id) ||
        typeof draft.createdAt !== 'string' || !Number.isFinite(Date.parse(draft.createdAt)) ||
        typeof draft.question !== 'string' || draft.question.length > 1000 ||
        typeof draft.spreadId !== 'string' || typeof draft.allowReversed !== 'boolean' ||
        !isValidSelection(draft.selection, draft.spreadId, draft.allowReversed)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveSelectionDraft(draft: SelectionDraft | null) {
  if (draft) sessionStorage.setItem(draftKey, JSON.stringify(draft));
  else sessionStorage.removeItem(draftKey);
}
