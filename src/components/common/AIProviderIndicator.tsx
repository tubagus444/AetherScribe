import { useEffect, useState } from 'react';
export function AIProviderIndicator() {
  const [provider, setProvider] = useState('');
  useEffect(() => {
    const listener = (event: Event) => setProvider((event as CustomEvent<string>).detail);
    window.addEventListener('ai-provider-dispatched', listener);
    return () => window.removeEventListener('ai-provider-dispatched', listener);
  }, []);
  return provider ? <div role="status" className="px-3 py-1 text-xs text-slate-500">Tujuan request AI terakhir: {provider === 'ollama' ? 'Ollama (lokal)' : `${provider} (cloud)`}</div> : null;
}
