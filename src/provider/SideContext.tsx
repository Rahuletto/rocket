import { createContext, useState, useContext } from "react";
import type { ReactNode } from "react";

const SideContext = createContext({
  side: "left",
  toggleSide: () => {},
});

export const SideProvider = ({ children }: { children: ReactNode }) => {
  const [side, setSide] = useState<"left" | "right">("left");

  function toggleSide() {
    setSide(side === "left" ? "right" : "left");
  }

  return (
    <SideContext.Provider value={{ side, toggleSide }}>
      {children}
    </SideContext.Provider>
  );
};

export function useSide() {
  const { side, toggleSide } = useContext(SideContext);
  return { side, toggleSide };
}
