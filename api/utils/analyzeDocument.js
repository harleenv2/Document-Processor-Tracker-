import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const client = new Anthropic();

const DOC_TYPES = [
  'Passport', 'Emirates ID', 'Driving Licence', 'ID Document', 'Residence Visa', 'Marriage Certificate',
  'Bank Application', 'Bank Statement', 'Bank Statement Consent', 'Pay Slip', 'Salary Certificate', 'Salary Transfer Letter', 'P60', 'P45', 'SA302', 'Mortgage Statement',
  'Employment Letter', 'NOC Letter', 'Accountant Letter', 'Reference Letter', 'Trade License',
  'Title Deed', 'Tenancy Contract', 'Utility Bill', 'Council Tax',
];

const SYSTEM_PROMPT = `You are a document analysis assistant for a UK mortgage brokerage.
Analyse the document and return a JSON object with exactly five fields:

- "docType": choose the closest match from this list: ${DOC_TYPES.join(', ')}. If none match, use a short descriptive label.
  Key distinctions:
  • "Salary Certificate" = a formal employer letter confirming an employee's salary. Do NOT classify as "Pay Slip".
  • "Pay Slip" = a payroll stub with a breakdown of earnings and deductions for a pay period.
  • "Bank Statement Consent" = a consent, mandate or authorisation form. Do NOT classify as "Bank Statement".
  • "Bank Application" = a loan or bank account application form. Do NOT classify as "Bank Statement".

- "personName": the full name of the primary person the document belongs to.
  Key rules:
  • Emirates ID: use the English name exactly as printed in the Name field — ignore all Arabic text.
  • Passport: use the name from the personal details page or MRZ (Given Names + Surname).
  • Residence Visa: use the visa holder's full English name.
  • Salary Certificate / Pay Slip: use the employee's name.
  • Bank Statement: use the account holder's name.
  Return null if you cannot determine a name.

- "period": for Bank Statement or Pay Slip only — a human-readable period string e.g. "Jan 2025" or "Jan 2025 - Mar 2025". Return null for all other document types.

- "periodStart": for Bank Statement or Pay Slip only — the start date in "YYYY-MM" format. Return null for all other document types.

- "periodEnd": for Bank Statement or Pay Slip only — the end date in "YYYY-MM" format (same as periodStart for single-month documents). Return null for all other document types.

Return ONLY valid JSON, no markdown, no explanation.`;

export async function analyzeDocument(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');

  const contentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } };

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Analyse this document.' }] }],
  });

  const raw = message.content[0].text.trim();
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const result = JSON.parse(json);

  return {
    docType:     result.docType     || 'Unknown',
    personName:  result.personName  || '',
    period:      result.period      ?? null,
    periodStart: result.periodStart ?? null,
    periodEnd:   result.periodEnd   ?? null,
  };
}
