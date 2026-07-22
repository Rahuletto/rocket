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
  kind?: "created" | "deleted" | "modified";
  patch: string;
  path: string;
}

export interface ReviewState {
  files: ReviewFile[];
  onKeep?: (path?: string) => Promise<void>;
  onRefresh?: () => Promise<ReviewFile[]>;
  source: "agent" | "git";
  title: string;
}

interface ReviewContextValue {
  closeReview: () => void;
  openReview: (review: ReviewState) => void;
  review?: ReviewState;
  updateFiles: (files: ReviewFile[]) => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState<ReviewState>();
  const closeReview = useCallback(() => setReview(undefined), []);
  const openReview = useCallback((next: ReviewState) => setReview(next), []);
  const updateFiles = useCallback((files: ReviewFile[]) => {
    setReview((current) => current ? { ...current, files } : current);
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
