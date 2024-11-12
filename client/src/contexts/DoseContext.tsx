import { createContext, useContext, useState, ReactNode } from 'react';

interface DoseContextType {
  updateTrigger: number;
  triggerUpdate: () => void;
  lastDeletedDose: any | null;
  setLastDeletedDose: (dose: any | null) => void;
}

const DoseContext = createContext<DoseContextType | undefined>(undefined);

export function DoseProvider({ children }: { children: ReactNode }) {
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [lastDeletedDose, setLastDeletedDose] = useState<any | null>(null);

  const triggerUpdate = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  return (
    <DoseContext.Provider value={{ 
      updateTrigger, 
      triggerUpdate, 
      lastDeletedDose, 
      setLastDeletedDose 
    }}>
      {children}
    </DoseContext.Provider>
  );
}

export function useDoseContext() {
  const context = useContext(DoseContext);
  if (context === undefined) {
    throw new Error('useDoseContext must be used within a DoseProvider');
  }
  return context;
}
