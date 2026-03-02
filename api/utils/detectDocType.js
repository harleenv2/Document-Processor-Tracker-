const DOC_TYPE_MAP = [
  { label: 'Passport',             keywords: ['passport'] },
  { label: 'Bank Statement',       keywords: ['bank', 'statement', 'bankstatement'] },
  { label: 'Pay Slip',             keywords: ['payslip', 'payroll', 'salary', 'wage'] },
  { label: 'P60',                  keywords: ['p60'] },
  { label: 'P45',                  keywords: ['p45'] },
  { label: 'SA302',                keywords: ['sa302', 'taxreturn', 'tax return'] },
  { label: 'Driving Licence',      keywords: ['driving', 'licence', 'license'] },
  { label: 'Utility Bill',         keywords: ['utility', 'electric', 'gas', 'water'] },
  { label: 'Council Tax',          keywords: ['council'] },
  { label: 'Employment Letter',    keywords: ['employment', 'employer', 'contract'] },
  { label: 'Accountant Letter',    keywords: ['accountant'] },
  { label: 'Mortgage Statement',   keywords: ['mortgage'] },
  { label: 'Reference Letter',     keywords: ['reference'] },
  { label: 'ID Document',          keywords: ['id', 'identity', 'identification'] },
];

export const ALL_DOC_TYPES = DOC_TYPE_MAP.map((d) => d.label);

export function detectDocType(filename) {
  const stem = filename
    .replace(/\.[^.]+$/, '')          // strip extension
    .toLowerCase()
    .replace(/[_\-]/g, ' ');          // normalise separators

  for (const { label, keywords } of DOC_TYPE_MAP) {
    for (const kw of keywords) {
      if (stem.includes(kw)) return label;
    }
  }

  // Fallback: capitalise the stem words
  return stem
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
