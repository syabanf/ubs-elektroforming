import { FormField, Input } from '@ef/ui'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  unit?: string
  hint?: React.ReactNode
  error?: string | null
  required?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/** A decimal field with its unit on the right. Accepts a comma or a dot. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  hint,
  error,
  required,
  placeholder,
  className,
  autoFocus,
}: Props) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} className={className}>
      <Input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        inputClassName="tabular-nums text-base md:text-sm"
        rightSlot={unit ? <span className="text-xs font-semibold text-muted">{unit}</span> : undefined}
      />
    </FormField>
  )
}
