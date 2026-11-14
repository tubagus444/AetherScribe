import type React from 'react';
import { Cpu, Wand2, Feather, Flame, Eye, Drama, Quote, Scissors, Languages, Sparkles } from 'lucide-react';

// Registry ikon yang boleh dipilih untuk sebuah aksi kustom. Disimpan sebagai
// slug string di `AIAction.icon`; resolusi ke komponen lewat ACTION_ICONS.
export const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  cpu: Cpu,
  wand: Wand2,
  feather: Feather,
  flame: Flame,
  eye: Eye,
  drama: Drama,
  quote: Quote,
  scissors: Scissors,
  languages: Languages,
  sparkles: Sparkles,
};

export const ICON_OPTIONS = Object.keys(ACTION_ICONS);
export const DEFAULT_ICON = 'cpu';

export function getActionIcon(slug?: string) {
  return ACTION_ICONS[slug || ''] || ACTION_ICONS[DEFAULT_ICON];
}
