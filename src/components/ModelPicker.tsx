// ============================================================================
// ModelPicker — pure UI dropdown. Reads from `src/lib/modelChoices.ts` so all
// screens share the same model list.
// ============================================================================

import { MODEL_CHOICES } from '../lib/modelChoices';

interface Props {
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  label?: string;
}

export function ModelPicker({ value, onChange, disabled, label }: Props) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: 13 }}>
      {label && <span style={{ opacity: 0.75 }}>{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{
          background: '#2a2018',
          color: '#e8e4d8',
          border: '1px solid #3a3228',
          padding: '0.5rem 0.75rem',
          borderRadius: 4,
          fontSize: 14,
          minWidth: 200,
        }}
      >
        {MODEL_CHOICES.map((c, i) => (
          <option key={c.pricingKey} value={i}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
