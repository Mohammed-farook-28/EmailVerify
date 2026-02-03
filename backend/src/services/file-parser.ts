import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

interface ParsedEmail {
  email: string;
  row: number;
}

interface ParseResult {
  emails: string[];
  totalCount: number;
  validEmailsCount: number;
}

/**
 * Simple email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Parse CSV file and extract emails
 */
export async function parseCSV(filePath: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const emails: string[] = [];
    let validCount = 0;
    let totalCount = 0;
    let headers: string[] = [];
    let emailColumnIndex = -1;

    const parser = createReadStream(filePath).pipe(
      parse({
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true, // Allow variable column counts
      })
    );

    parser.on('data', (row: string[]) => {
      totalCount++;

      // First row - detect headers and email column
      if (totalCount === 1) {
        headers = row.map((h) => h.toLowerCase().trim());

        // Try to find email column
        emailColumnIndex = headers.findIndex((h) =>
          h.includes('email') || h.includes('e-mail') || h.includes('mail')
        );

        // If no email column found, assume first column
        if (emailColumnIndex === -1) {
          emailColumnIndex = 0;
        }

        // If the first row looks like data (not headers), process it
        if (row[emailColumnIndex] && isValidEmail(row[emailColumnIndex])) {
          const email = row[emailColumnIndex].trim().toLowerCase();
          emails.push(email);
          validCount++;
        }
        return;
      }

      // Extract email from detected column
      const emailValue = row[emailColumnIndex]?.trim().toLowerCase();
      if (emailValue) {
        emails.push(emailValue);
        if (isValidEmail(emailValue)) {
          validCount++;
        }
      }
    });

    parser.on('error', (error) => {
      reject(new Error(`CSV parsing error: ${error.message}`));
    });

    parser.on('end', () => {
      // Validation: At least 50% should be valid emails
      const validPercentage = (validCount / totalCount) * 100;
      if (validPercentage < 50) {
        reject(
          new Error(
            `Invalid file format: Only ${validPercentage.toFixed(1)}% of entries appear to be valid emails. Expected at least 50%.`
          )
        );
        return;
      }

      resolve({
        emails,
        totalCount: emails.length,
        validEmailsCount: validCount,
      });
    });
  });
}

/**
 * Parse Excel file and extract emails
 */
export async function parseExcel(filePath: string): Promise<ParseResult> {
  try {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error('Excel file has no sheets');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    const emails: string[] = [];
    let validCount = 0;
    let emailColumnIndex = -1;

    // First row - detect email column
    const headers = data[0].map((h: any) =>
      h ? String(h).toLowerCase().trim() : ''
    );

    emailColumnIndex = headers.findIndex((h) =>
      h.includes('email') || h.includes('e-mail') || h.includes('mail')
    );

    // If no email column found, assume first column
    if (emailColumnIndex === -1) {
      emailColumnIndex = 0;
    }

    // Process all rows (including first if it contains data)
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const emailValue = row[emailColumnIndex]
        ? String(row[emailColumnIndex]).trim().toLowerCase()
        : '';

      if (emailValue && emailValue !== headers[emailColumnIndex]) {
        emails.push(emailValue);
        if (isValidEmail(emailValue)) {
          validCount++;
        }
      }
    }

    // Validation: At least 50% should be valid emails
    const validPercentage = (validCount / emails.length) * 100;
    if (validPercentage < 50) {
      throw new Error(
        `Invalid file format: Only ${validPercentage.toFixed(1)}% of entries appear to be valid emails. Expected at least 50%.`
      );
    }

    return {
      emails,
      totalCount: emails.length,
      validEmailsCount: validCount,
    };
  } catch (error: any) {
    throw new Error(`Excel parsing error: ${error.message}`);
  }
}

/**
 * Parse uploaded file based on extension
 */
export async function parseEmailFile(
  filePath: string,
  filename: string
): Promise<ParseResult> {
  const extension = filename.toLowerCase().split('.').pop();

  if (extension === 'csv') {
    return parseCSV(filePath);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return parseExcel(filePath);
  } else {
    throw new Error(
      'Unsupported file format. Please upload a CSV or Excel file (.csv, .xlsx, .xls)'
    );
  }
}

/**
 * Validate column contains mostly valid emails
 */
export function validateEmailColumn(emails: string[]): boolean {
  const validCount = emails.filter(isValidEmail).length;
  const validPercentage = (validCount / emails.length) * 100;
  return validPercentage >= 50;
}
