import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatNicaNumber,
  nicaRemainingLabelPlain,
  nicaSpotWeightForSignup,
  volunteerSpotsForBeneficiary
} from './nicaSpotMath';
import { formatEventDateInPacific, isFlexibleTime } from './utils/timeDisplay';

function hoursForSignup(signup) {
  const role = signup?.role;
  if (!role) return 0;
  if (isFlexibleTime(role)) return 0;
  const start = new Date(`2000-01-01 ${role.start_time}`);
  const end = new Date(`2000-01-01 ${role.end_time}`);
  const h = (end - start) / (1000 * 60 * 60);
  return Math.round(h * 100) / 100;
}

/**
 * @param {{ label: string, affiliationNames: string[] }} beneficiary
 * @param {Array<{ id: string, name: string }>} affiliationsList
 * @param {Array<Record<string, unknown>>} volunteersList
 */
export function buildNicaTeamExport(beneficiary, affiliationsList, volunteersList) {
  const matchingAffiliationIds = new Set(
    affiliationsList
      .filter((entry) => beneficiary.affiliationNames.includes(entry.name))
      .map((entry) => entry.id)
  );

  const rows = [];
  for (const v of volunteersList) {
    if (!matchingAffiliationIds.has(v.team_club_affiliation_id || '')) continue;

    const teamName =
      affiliationsList.find((a) => a.id === v.team_club_affiliation_id)?.name || '';

    const signups = v.signups || [];
    for (const s of signups) {
      if (s.status !== 'confirmed') continue;
      const role = s.role;
      const flex = role && isFlexibleTime(role);
      const hours = hoursForSignup(s);
      const spotWeight = nicaSpotWeightForSignup(s);
      rows.push({
        email: v.email || '',
        first_name: v.first_name || '',
        last_name: v.last_name || '',
        phone: v.phone != null && v.phone !== '' ? String(v.phone) : '',
        team_club_affiliation: teamName,
        signed_up_role: role?.name || '',
        spotWeight,
        spotWeightDisplay: formatNicaNumber(spotWeight),
        event_date: role?.event_date || '',
        hours,
        hoursDisplay: flex ? '—' : (Number.isFinite(hours) ? String(hours) : '0')
      });
    }
  }

  rows.sort((a, b) => {
    const ln = (a.last_name || '').localeCompare(b.last_name || '', undefined, { sensitivity: 'base' });
    if (ln !== 0) return ln;
    const fn = (a.first_name || '').localeCompare(b.first_name || '', undefined, { sensitivity: 'base' });
    if (fn !== 0) return fn;
    const d = String(a.event_date).localeCompare(String(b.event_date));
    if (d !== 0) return d;
    return String(a.signed_up_role).localeCompare(String(b.signed_up_role), undefined, { sensitivity: 'base' });
  });

  /** Sum of `spot_wt` in this PDF — must match admin NICA table (same math as volunteerSpotsForBeneficiary). */
  const volunteerSpotsFromRows = rows.reduce((sum, r) => sum + (Number.isFinite(r.spotWeight) ? r.spotWeight : 0), 0);
  const volunteerSpotsTable = volunteerSpotsForBeneficiary(beneficiary, affiliationsList, volunteersList);
  if (rows.length > 0 && Math.abs(volunteerSpotsFromRows - volunteerSpotsTable) > 0.02) {
    console.warn('[NICA PDF] Spot total mismatch', {
      beneficiary: beneficiary.label,
      fromRows: volunteerSpotsFromRows,
      fromTableFn: volunteerSpotsTable
    });
  }
  const volunteerSpots = volunteerSpotsFromRows;
  const totalHours = Math.round(rows.reduce((sum, r) => sum + (Number.isFinite(r.hours) ? r.hours : 0), 0) * 100) / 100;

  return {
    rows,
    summary: {
      volunteerSpots,
      remainingLabel: nicaRemainingLabelPlain(volunteerSpots),
      signupRowCount: rows.length,
      totalHours
    }
  };
}

function sanitizeFilenamePart(label) {
  return String(label)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';
}

/**
 * @param {{ label: string, affiliationNames: string[] }} beneficiary
 * @param {Array<{ id: string, name: string }>} affiliationsList
 * @param {Array<Record<string, unknown>>} volunteersList
 * @returns {Blob}
 */
export function generateNicaTeamVolunteerPdfBlob(beneficiary, affiliationsList, volunteersList) {
  const { rows, summary } = buildNicaTeamExport(beneficiary, affiliationsList, volunteersList);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  /** Side margins and table width so column widths sum to the drawable area (avoids autotable overflow warnings). */
  const sideMargin = 28;
  const tableWidth = pageW - sideMargin * 2;
  const col = (fraction) => Math.floor(tableWidth * fraction);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`2026 Berkeley Omnium — ${beneficiary.label} Volunteers`, pageW / 2, 42, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 86, 94);
  doc.text(
    'Volunteer spots = sum of spot_wt (some roles count as 2.5). Compare to Admin → Users → NICA Beneficiary Summary.',
    pageW / 2,
    56,
    { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);

  const tableBody = rows.map((r) => [
    r.email,
    r.first_name,
    r.last_name,
    r.phone,
    r.team_club_affiliation,
    r.signed_up_role,
    r.spotWeightDisplay,
    formatEventDateInPacific(r.event_date, 'short'),
    r.hoursDisplay
  ]);

  const head = [
    [
      'email',
      'first_name',
      'last_name',
      'phone',
      'team_club_affiliation',
      'signed_up_role',
      'spot_wt',
      'event_date',
      'hours'
    ]
  ];

  let finalY = 90;
  const detailTableStartY = tableBody.length ? 68 : 56;
  if (tableBody.length) {
    const c0 = col(0.155);
    const c1 = col(0.085);
    const c2 = col(0.085);
    const c3 = col(0.095);
    const c4 = col(0.125);
    const c5 = col(0.18);
    const c6 = col(0.055);
    const c7 = col(0.095);
    const c8 = tableWidth - c0 - c1 - c2 - c3 - c4 - c5 - c6 - c7;
    autoTable(doc, {
      startY: detailTableStartY,
      margin: { left: sideMargin, right: sideMargin },
      tableWidth,
      head,
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [246, 248, 250], textColor: [36, 41, 47], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: c0 },
        1: { cellWidth: c1 },
        2: { cellWidth: c2 },
        3: { cellWidth: c3 },
        4: { cellWidth: c4 },
        5: { cellWidth: c5 },
        6: { cellWidth: c6 },
        7: { cellWidth: c7 },
        8: { cellWidth: c8 }
      }
    });
    finalY = doc.lastAutoTable.finalY;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80, 86, 94);
    doc.text(
      'No volunteers with this team affiliation and at least one confirmed signup.',
      pageW / 2,
      78,
      { align: 'center' }
    );
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
  }
  const gap = 18;

  const summaryTableW = Math.min(520, tableWidth);
  autoTable(doc, {
    startY: finalY + gap,
    margin: { left: sideMargin, right: sideMargin },
    tableWidth: summaryTableW,
    body: [
      ['Volunteer spots (NICA)', 'Remaining (of 10)', 'Volunteers', 'Volunteer hours'],
      [
        formatNicaNumber(summary.volunteerSpots),
        summary.remainingLabel,
        String(summary.signupRowCount),
        summary.totalHours.toFixed(2)
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: summaryTableW / 4 },
      1: { cellWidth: summaryTableW / 4 },
      2: { cellWidth: summaryTableW / 4 },
      3: { cellWidth: summaryTableW / 4 }
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [246, 248, 250];
      }
    }
  });

  return doc.output('blob');
}

export function nicaTeamPdfFilename(beneficiary) {
  return `2026-Omnium-${sanitizeFilenamePart(beneficiary.label)}-Volunteers.pdf`;
}
