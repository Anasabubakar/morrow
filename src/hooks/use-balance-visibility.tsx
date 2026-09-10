import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'morrow.balance-visible.v1';

type BalanceVisibilityContextValue = { visible: boolean; toggle: () => void };

const BalanceVisibilityContext = createContext<BalanceVisibilityContextValue | null>(null);

/** Hidden by default, like every real banking app — only shown once the user explicitly reveals it. */
export function BalanceVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'true') setVisible(true);
    });
  }, []);

  function toggle() {
    setVisible(current => {
      const next = !current;
      AsyncStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  return <BalanceVisibilityContext.Provider value={{ visible, toggle }}>{children}</BalanceVisibilityContext.Provider>;
}

export function useBalanceVisibility(): BalanceVisibilityContextValue {
  const ctx = useContext(BalanceVisibilityContext);
  if (!ctx) throw new Error('useBalanceVisibility must be used within a BalanceVisibilityProvider');
  return ctx;
}
