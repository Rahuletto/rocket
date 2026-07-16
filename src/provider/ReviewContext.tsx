import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

export interface ReviewFile {
  patch: string;
  path: string;
}

interface ReviewState {
  files: ReviewFile[];
  source: "agent" | "git";
  title: string;
}

interface ReviewContextValue {
  closeReview: () => void;
  openReview: (review: ReviewState) => void;
  review?: ReviewState;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState<ReviewState>();
  const closeReview = useCallback(() => setReview(undefined), []);
  const openReview = useCallback((next: ReviewState) => setReview(next), []);

  return (
    <ReviewContext.Provider value={{ closeReview, openReview, review }}>
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) throw new Error("useReview must be used inside ReviewProvider");
  return context;
}
