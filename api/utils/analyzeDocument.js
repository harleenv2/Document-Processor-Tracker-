import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const client = new Anthropic();

const DOC_TYPES = [
  'Passport', 'Emirates ID', 'Driving Licence', 'ID Document', 'Residence Visa', 'Marriage Certificate',
  'Bank Application', 'Bank Statement', 'Bank Statement Consent', 'Pay Slip', 'Salary Certificate', 'Salary Transfer Letter', 'P60', 'P45', 'SA302', 'Mortgage Statement',
  'Employment Letter', 'NOC Letter', 'Accountant Letter', 'Reference Letter', 'Trade License',
  'Title Deed', 'Tenancy Contract', 'Utility Bill', 'Council Tax',
];

// Type-specific name extraction instructions
const NAME_INSTRUCTION = {
  'Emirates ID':        'the full name exactly as printed in English in the Name field — ignore all Arabic text',
  'Passport':           'the full name from the name fields or MRZ (Given Names + Surname)',
  'Residence Visa':     'the visa holder\'s full English name',
  'Salary Certificate': 'the employee\'s full name as stated in the certificate',
  'Pay Slip':           'the employee\'s full name from the payslip',
  'Bank Statement':     'the account holder\'s full name',
  'Default':            'the full name of the primary person the document belongs to',
};

const PERIOD_TYPES = new Set(['Bank Statement', 'Pay Slip']);

// Call 1: classify the document type only
async function classifyDocType(contentBlock) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 64,
    system: `You are a document classification assistant. Choose the single best match for the document from this list: ${DOC_TYPES.join(', ')}.
Important distinctions:
- "Salary Certificate" is a formal letter from an employer confirming an employee's salary — NOT a "Pay Slip".
- "Pay Slip" is a payroll stub showing a breakdown of earnings and deductions for a specific pay period.
- "Bank Statement Consent" is a consent/authorisation/mandate form, NOT a "Bank Statement".
- "Bank Application" is a loan or bank application form, NOT a "Bank Statement".
If none match, use a short descriptive label. Reply with ONLY the document type — no punctuation, no explanation, no JSON.`,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'What type of document is this?' }] }],
  });
  return message.content[0].text.trim();
}

// Call 2: extract fields tailored to the detected doc type
async function extractFields(contentBlock, docType) {
  const nameInstruction = NAME_INSTRUCTION[docType] ?? NAME_INSTRUCTION['Default'];
  const includePeriod = PERIOD_TYPES.has(docType);

  const periodInstructions = includePeriod
    ? `- "period": a human-readable period string e.g. "Jan 2025" or "Jan 2025 - Mar 2025".
- "periodStart": the start date in "YYYY-MM" format.
- "periodEnd": the end date in "YYYY-MM" format (same as periodStart for single-month documents).`
    : `- "period": null
- "periodStart": null
- "periodEnd": null`;

  const system = `You are a document data extraction assistant for a UK mortgage brokerage.
This document is a ${docType}. Extract the following fields and return a JSON object with exactly four fields:
- "personName": ${nameInstruction}. Return null if you cannot determine a name.
${periodInstructions}
Return ONLY valid JSON, no markdown, no explanation.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extract the required fields from this document.' }] }],
  });

  const raw = message.content[0].text.trim();
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(json);
}

export async function analyzeDocument(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');

  const contentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } };

  const docType = await classifyDocType(contentBlock);
  const fields  = await extractFields(contentBlock, docType);

  return {
    docType:     docType            || 'Unknown',
    personName:  fields.personName  || '',
    period:      fields.period      ?? null,
    periodStart: fields.periodStart ?? null,
    periodEnd:   fields.periodEnd   ?? null,
  };
}
