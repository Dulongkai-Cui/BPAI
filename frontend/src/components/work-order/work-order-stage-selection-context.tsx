"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WorkOrderStageSelectionContextValue = {
  selectedStage: string;
  setSelectedStage: (stage: string) => void;
};

const WorkOrderStageSelectionContext =
  createContext<WorkOrderStageSelectionContextValue | null>(null);

export function WorkOrderStageSelectionProvider({
  initialStage,
  children,
}: {
  initialStage: string;
  children: ReactNode;
}) {
  const [selectedStage, setSelectedStage] = useState(initialStage);

  useEffect(() => {
    setSelectedStage(initialStage);
  }, [initialStage]);

  const value = useMemo(
    () => ({
      selectedStage,
      setSelectedStage,
    }),
    [selectedStage],
  );

  return (
    <WorkOrderStageSelectionContext.Provider value={value}>
      {children}
    </WorkOrderStageSelectionContext.Provider>
  );
}

export function useWorkOrderStageSelection() {
  return useContext(WorkOrderStageSelectionContext);
}
