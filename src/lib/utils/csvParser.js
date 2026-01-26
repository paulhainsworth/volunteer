/**
 * CSV Parser for Volunteer Roles
 */

export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Validate required headers (start_time, end_time optional — empty → "flexible")
  const requiredHeaders = ['name', 'event_date', 'positions_total'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
  }

  // Optional time columns: if missing from headers, rows won't have them; we default in validateRole
  const hasStart = headers.includes('start_time');
  const hasEnd = headers.includes('end_time');

  // Parse data rows
  const roles = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    try {
      const values = parseCSVLine(line);
      
      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
        continue;
      }

      const role = {};
      headers.forEach((header, index) => {
        role[header] = values[index] !== undefined ? String(values[index]).trim() : '';
      });
      if (!hasStart) role.start_time = '';
      if (!hasEnd) role.end_time = '';

      // Validate and transform the role
      const validatedRole = validateRole(role, i + 1);
      roles.push(validatedRole);
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error.message}`);
    }
  }

  return {
    roles,
    errors,
    totalRows: lines.length - 1,
    successCount: roles.length,
    errorCount: errors.length
  };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

function validateRole(role, rowNumber) {
  const errors = [];

  // Validate name
  if (!role.name || role.name.length === 0) {
    errors.push('Name is required');
  }

  // Validate event_date (YYYY-MM-DD format)
  if (!role.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(role.event_date)) {
    errors.push('Event date must be in YYYY-MM-DD format (e.g., 2026-06-15)');
  }

  // start_time / end_time: optional. Empty or invalid HH:MM → "flexible"
  const validTime = (t) => t && /^\d{2}:\d{2}$/.test(String(t).trim());
  const startOk = validTime(role.start_time);
  const endOk = validTime(role.end_time);
  if (!startOk || !endOk) {
    role.start_time = 'flexible';
    role.end_time = 'flexible';
  } else {
    role.start_time = String(role.start_time).trim();
    role.end_time = String(role.end_time).trim();
  }

  // Validate positions_total (must be positive integer)
  const positions = parseInt(role.positions_total);
  if (isNaN(positions) || positions < 1) {
    errors.push('Positions total must be a positive number');
  } else {
    role.positions_total = positions;
  }

  // Validate start_time < end_time (skip when flexible)
  if (role.start_time !== 'flexible' && role.end_time !== 'flexible') {
    const start = new Date(`2000-01-01 ${role.start_time}`);
    const end = new Date(`2000-01-01 ${role.end_time}`);
    if (start >= end) {
      errors.push('Start time must be before end time');
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  // Clean up optional fields
  role.description = role.description || '';
  role.location = role.location || '';
  role.leader_email = role.leader_email || '';
  role.domain_name = role.domain_name || '';

  return role;
}

export function generateTemplateCSV() {
  const headers = ['name', 'description', 'event_date', 'start_time', 'end_time', 'location', 'positions_total', 'domain_name', 'leader_email'];
  const exampleRows = [
    ['Registration Table', 'Check in riders and hand out race numbers', '2026-06-15', '07:00', '09:00', 'Main tent near start/finish', '4', 'Registration & Check-in', ''],
    ['Course Marshal - Corner 1', 'Direct riders at first turn', '2026-06-15', '08:00', '12:00', 'Corner of Main St and Oak Ave', '2', 'Course Marshals', ''],
    ['Water Station 1', 'Hand out water bottles to riders', '2026-06-15', '08:30', '11:30', 'Mile marker 10', '3', 'Water Stations & Aid', ''],
    ['Pre-race Setup (flexible)', 'Help with setup; time TBD', '2026-06-14', '', '', 'Event site', '2', 'Loading & Logistics', '']
  ];

  const csvContent = [
    headers.join(','),
    ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

export function downloadTemplate() {
  const csvContent = generateTemplateCSV();
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'volunteer-roles-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

