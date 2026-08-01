export type JournalSaveViewState = Readonly<{
  selectedId: string | null;
  baseline: string;
  saveState: "saved" | "unsaved" | "saving" | "failed";
  error: string;
}>;

/** A completed request may only affect editor state when its entry is still selected. */
export function resolveJournalSaveResult(state:JournalSaveViewState,result:{entryId:string;baseline?:string;error?:string}):JournalSaveViewState {
  if(state.selectedId!==result.entryId)return state;
  if(result.error)return {...state,saveState:"failed",error:result.error};
  return {...state,baseline:result.baseline??state.baseline,saveState:"saved",error:""};
}
