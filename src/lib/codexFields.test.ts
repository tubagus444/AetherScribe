import { describe, it, expect } from 'vitest';
import {
  slugifyFieldKey,
  resolveFieldValues,
  fieldValueMap,
  buildFieldValues,
  formatFieldsForAI,
  formatFieldsForMarkdown,
} from './codexFields';
import type { CategoryFieldDef, CustomFieldValue } from '@/src/types';

const defs: CategoryFieldDef[] = [
  { key: 'habitat', label: 'Habitat', type: 'text' },
  { key: 'kelemahan', label: 'Kelemahan Fatal', type: 'textarea' },
  { key: 'ancaman', label: 'Level Ancaman', type: 'select', options: ['Rendah', 'Tinggi'] },
];

describe('slugifyFieldKey', () => {
  it('membuat slug dari label', () => {
    expect(slugifyFieldKey('Kelemahan Fatal', [])).toBe('kelemahan-fatal');
  });
  it('menjamin unik terhadap key yang ada', () => {
    expect(slugifyFieldKey('Habitat', ['habitat'])).toBe('habitat-2');
    expect(slugifyFieldKey('Habitat', ['habitat', 'habitat-2'])).toBe('habitat-3');
  });
  it('fallback ke "field" bila label tak menghasilkan slug', () => {
    expect(slugifyFieldKey('!!!', [])).toBe('field');
    expect(slugifyFieldKey('!!!', ['field'])).toBe('field-2');
  });
});

describe('buildFieldValues', () => {
  it('supports field keys that are also inherited object property names', () => {
    const field = { key: 'constructor', label: 'Constructor', type: 'text' } as const;
    expect(buildFieldValues([field], {})).toEqual([]);
    expect(buildFieldValues([field], { constructor: 'Damar' })).toEqual([{ key: 'constructor', label: 'Constructor', value: 'Damar' }]);
  });
  it('preserves retired values and reserves keys for active fields even when they are empty', () => {
    const retained = [
      { key: 'habitat', label: 'Habitat lama', value: 'Pohon Raksasa' },
      { key: 'habitat-2', label: 'Habitat awal', value: 'Danau' },
      { key: 'asal', label: 'Asal', value: 'Desa Awan' },
    ];
    const values = buildFieldValues(defs, {}, retained);
    expect(values).toEqual([
      { ...retained[0], key: 'habitat-3' },
      retained[1],
      retained[2],
    ]);
    expect(buildFieldValues(defs, {}, values)).toEqual(values);
    expect(buildFieldValues([], {}, retained)).toEqual(retained);
  });
  it('menyertakan hanya field ber-nilai, urut sesuai defs, denormalisasi label', () => {
    const out = buildFieldValues(defs, { kelemahan: 'Api', habitat: 'Gua', ancaman: '' });
    expect(out).toEqual<CustomFieldValue[]>([
      { key: 'habitat', label: 'Habitat', value: 'Gua' },
      { key: 'kelemahan', label: 'Kelemahan Fatal', value: 'Api' },
    ]);
  });
  it('trim nilai & buang yang kosong/spasi', () => {
    expect(buildFieldValues(defs, { habitat: '   ' })).toEqual([]);
    expect(buildFieldValues(defs, { habitat: '  Gua  ' })).toEqual([
      { key: 'habitat', label: 'Habitat', value: 'Gua' },
    ]);
  });
  it('mengembalikan array kosong bila tak ada definisi', () => {
    expect(buildFieldValues(undefined, { habitat: 'Gua' })).toEqual([]);
    expect(buildFieldValues([], { habitat: 'Gua' })).toEqual([]);
  });
});

describe('resolveFieldValues & fieldValueMap', () => {
  const entry = {
    customFields: [
      { key: 'habitat', label: 'Habitat', value: 'Gua' },
      { key: 'kosong', label: 'Kosong', value: '  ' },
    ],
  };
  it('resolveFieldValues membuang nilai kosong, jaga urutan', () => {
    expect(resolveFieldValues(entry)).toEqual([{ key: 'habitat', label: 'Habitat', value: 'Gua' }]);
  });
  it('resolveFieldValues aman untuk entri tanpa customFields', () => {
    expect(resolveFieldValues({})).toEqual([]);
    expect(resolveFieldValues({ customFields: undefined })).toEqual([]);
  });
  it('fieldValueMap memetakan key→value (termasuk yang kosong)', () => {
    expect(fieldValueMap(entry)).toEqual({ habitat: 'Gua', kosong: '  ' });
    expect(fieldValueMap(null)).toEqual({});
  });
});

describe('formatFieldsForAI', () => {
  const entry = {
    customFields: [
      { key: 'habitat', label: 'Habitat', value: 'Gua utara' },
      { key: 'kelemahan', label: 'Kelemahan Fatal', value: 'Api' },
    ],
  };
  it('membuat baris Label: nilai deterministik', () => {
    expect(formatFieldsForAI(entry)).toBe('Habitat: Gua utara\nKelemahan Fatal: Api');
  });
  it('byte-identik untuk input sama (jaminan cache)', () => {
    expect(formatFieldsForAI(entry)).toBe(formatFieldsForAI(entry));
  });
  it('kosong bila tak ada field', () => {
    expect(formatFieldsForAI({})).toBe('');
  });
});

describe('formatFieldsForMarkdown', () => {
  it('membuat definition-list Markdown', () => {
    const entry = {
      customFields: [
        { key: 'habitat', label: 'Habitat', value: 'Gua' },
        { key: 'kelemahan', label: 'Kelemahan Fatal', value: 'Api' },
      ],
    };
    expect(formatFieldsForMarkdown(entry)).toBe('- **Habitat:** Gua\n- **Kelemahan Fatal:** Api');
  });
  it('kosong bila tak ada field', () => {
    expect(formatFieldsForMarkdown({ customFields: [] })).toBe('');
  });
});
