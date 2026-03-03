import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const DOC_TYPES = [
  // Identity
  'Passport', 'Emirates ID', 'Driving Licence', 'ID Document', 'Residence Visa', 'Marriage Certificate',
  // Financial
  'Bank Application', 'Bank Statement', 'Bank Statement Consent', 'Pay Slip', 'Salary Certificate', 'Salary Transfer Letter', 'P60', 'P45', 'SA302', 'Mortgage Statement',
  // Employment
  'Employment Letter', 'NOC Letter', 'Accountant Letter', 'Reference Letter', 'Trade License',
  // Property & Utilities
  'Title Deed', 'Tenancy Contract', 'Utility Bill', 'Council Tax',
];

const SYSTEM_PROMPT = `You are a document analysis assistant for a UK mortgage brokerage.
Analyse the document and return a JSON object with exactly five fields:
- "docType": choose the closest match from this list: ${DOC_TYPES.join(', ')}. If none match, use a short descriptive label.
- "personName": the full name of the primary person the document belongs to (e.g. the passport holder, account owner, employee). For Emirates ID or similar bilingual cards, use the English name exactly as printed — do not transliterate from Arabic. Return null if you cannot determine a name.
- "period": for Bank Statement or Pay Slip only, a human-readable period string e.g. "Jan 2025" or "Jan 2025 - Mar 2025". Return null for all other document types (including Bank Application and Bank Statement Consent).
- "periodStart": for Bank Statement or Pay Slip only, the start date in "YYYY-MM" format. Return null for all other document types (including Bank Application and Bank Statement Consent).
- "periodEnd": for Bank Statement or Pay Slip only, the end date in "YYYY-MM" format (same as periodStart for single-month documents). Return null for all other document types (including Bank Application and Bank Statement Consent).
Return ONLY valid JSON, no markdown, no explanation.`;

export async function analyzeDocument(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');

  let contentBlock;
  if (mimeType === 'application/pdf') {
    contentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    };
  } else {
    // image/jpeg or image/png
    contentBlock = {
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64 },
    };
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Analyse this document.' }] }],
  });

  const raw = message.content[0].text.trim();
  // Strip markdown code fences if model wraps response
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const result = JSON.parse(json);
  return {
    docType: result.docType || 'Unknown',
    personName: result.personName || '',
    period: result.period || null,
    periodStart: result.periodStart || null,
    periodEnd: result.periodEnd || null,
  };
}
