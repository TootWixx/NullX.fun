import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface EncryptionConfig {
  verification_blob: string;
  salt: string;
}

interface VaultContextType {
  encryptionConfig: EncryptionConfig | null;
  setEncryptionConfig: (config: EncryptionConfig | null) => void;
  unlocked: boolean;
  setUnlocked: (value: boolean) => void;
  sessionKey: string;
  setSessionKey: (value: string) => void;
  clearVault: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [encryptionConfig, setEncryptionConfig] = useState<EncryptionConfig | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [sessionKey, setSessionKey] = useState('');

  const value = useMemo<VaultContextType>(() => ({
    encryptionConfig,
    setEncryptionConfig,
    unlocked,
    setUnlocked,
    sessionKey,
    setSessionKey,
    clearVault: () => {
      setUnlocked(false);
      setSessionKey('');
    },
  }), [encryptionConfig, unlocked, sessionKey]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
}