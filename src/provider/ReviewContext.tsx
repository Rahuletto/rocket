import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

export interface ReviewFile {
  additions?: number;
  conflict?: boolean;
  deletions?: number;
  kind?: "created" | "deleted" | "modified" | "renamed";
  oldPath?: string;
  patch: string;
  path: string;
}

export interface ReviewState {
  files: ReviewFile[];
  onKeep?: (path?: string) => Promise<void>;
  onRevert?: (path?: string, force?: boolean) => Promise<void>;
  onRefresh?: () => Promise<ReviewFile[]>;
  source: "agent" | "git";
  title: string;
}

interface ReviewContextValue {
  closeReview: (expected?: ReviewState) => void;
  openReview: (review: ReviewState) => void;
  review?: ReviewState;
  updateFiles: (files: ReviewFile[], expected?: ReviewState) => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState<ReviewState>();
  const closeReview = useCallback((expected?: ReviewState) => {
    setReview((current) => !expected || current === expected ? undefined : current);
  }, []);
  const openReview = useCallback((next: ReviewState) => setReview(next), []);
  const updateFiles = useCallback((files: ReviewFile[], expected?: ReviewState) => {
    setReview((current) => current && (!expected || current === expected) ? { ...current, files } : current);
  }, []);

  return (
    <ReviewContext.Provider value={{ closeReview, openReview, review, updateFiles }}>
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) throw new Error("useReview must be used inside ReviewProvider");
  return context;
}
