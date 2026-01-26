# 📊 CSV Bulk Upload Format

## Quick Start

1. Download the template: Click **"Bulk Upload"** → **"Download CSV Template"**
2. Edit in Excel, Google Sheets, or any spreadsheet app
3. Export/Save as CSV
4. Upload back to the system

---

## CSV Format Specification

### Required Columns (Must Have)

| Column | Format | Example | Description |
|--------|--------|---------|-------------|
| `name` | Text | Registration Table | Role name (max 255 chars) |
| `event_date` | YYYY-MM-DD | 2026-06-15 | Event date (ISO format) |
| `positions_total` | Integer | 4 | Number of volunteer spots (≥1) |

### Optional Columns

| Column | Format | Example | Description |
|--------|--------|---------|-------------|
| `start_time` | HH:MM or empty | 07:00 | Start time (24-hour). **Leave empty for flexible** |
| `end_time` | HH:MM or empty | 09:00 | End time (24-hour). **Leave empty for flexible** |
| `description` | Text | Check in riders and hand out race numbers | Role description/responsibilities |
| `location` | Text | Main tent near start/finish | Meeting point or location |
| `domain_name` | Text | Course Marshals | Domain name (must match an existing domain) |
| `leader_email` | Email | leader@example.com | Direct leader (if no domain) |

---

## Example CSV

```csv
name,description,event_date,start_time,end_time,location,positions_total,domain_name,leader_email
Registration Table,Check in riders and hand out race numbers,2026-06-15,07:00,09:00,Main tent near start/finish,4,Registration & Check-in,
Course Marshal - Corner 1,Direct riders at first turn,2026-06-15,08:00,12:00,Corner of Main St and Oak Ave,2,Course Marshals,
Water Station 1,Hand out water bottles to riders,2026-06-15,08:30,11:30,Mile marker 10,3,Water Stations & Aid,
Pre-race Setup (flexible),Help with setup; time TBD,2026-06-14,,,Event site,2,Loading & Logistics,
```

**Flexible times:** Rows 4 has empty `start_time` and `end_time`. Those roles are shown as **Flexible** on the volunteer site.

---

## Validation Rules

### Date Format
- ✅ `2026-06-15` (YYYY-MM-DD)
- ❌ `06/15/2026` (US format)
- ❌ `15/06/2026` (EU format)
- ❌ `June 15, 2026` (text format)

### Time Format
- ✅ `07:00` (24-hour format with leading zero)
- ✅ `13:30` (afternoon in 24-hour)
- ✅ **Empty** → role is **Flexible** (no specific time). Leave both `start_time` and `end_time` empty.
- ❌ `7:00` (missing leading zero)
- ❌ `7:00 AM` (12-hour format with AM/PM)

### Time Logic
- If both `start_time` and `end_time` are empty → **Flexible** (displayed as "Flexible" on the site).
- If both are provided: start MUST be before end.
- ✅ `07:00` to `09:00`
- ❌ `09:00` to `07:00`
- ❌ `09:00` to `09:00` (same time)

### Positions
- Must be a positive integer (≥1)
- ✅ `1`, `5`, `20`
- ❌ `0`, `-1`, `2.5`, `two`

---

## Tips for Creating Your CSV

### Using Excel or Google Sheets

1. **Open the template** (volunteer-roles-template.csv)
2. **Edit in your spreadsheet app:**
   - Add/remove rows
   - Modify dates, times, locations
   - Copy rows for similar roles
3. **Keep the header row** (first row with column names)
4. **Save/Export as CSV**:
   - Excel: File → Save As → CSV (Comma delimited)
   - Google Sheets: File → Download → CSV

### Common Patterns

**Multiple shifts same day:**
```csv
Registration - Morning,Morning shift,2026-06-15,07:00,10:00,Registration tent,2
Registration - Afternoon,Afternoon shift,2026-06-15,10:00,13:00,Registration tent,2
```

**Multiple course marshals:**
```csv
Course Marshal - Corner 1,First turn,2026-06-15,08:00,12:00,Main & Oak,2
Course Marshal - Corner 2,Second turn,2026-06-15,08:00,12:00,Oak & Elm,2
Course Marshal - Corner 3,Sharp turn,2026-06-15,08:00,12:00,Elm & Pine,2
```

**Copy from previous year:**
1. Export existing roles to CSV
2. Change the dates to new year
3. Import back

---

## Special Characters

### Text with Commas
Wrap in quotes:
```csv
"Registration, Check-in, and Numbers",Description here,...
```

### Text with Quotes
Double the quotes:
```csv
"Position requires ""careful"" attention",Description,...
```

### Text with Line Breaks
Not recommended in CSV. Use semicolons instead:
```csv
"Task 1; Task 2; Task 3",Description,...
```

---

## Troubleshooting

### "Missing required columns" error

**Problem:** Header row is wrong or missing  
**Solution:** First row must have exact column names:
```csv
name,description,event_date,start_time,end_time,location,positions_total
```

### "Column count mismatch" error

**Problem:** Row has wrong number of columns  
**Solution:** Make sure every row has the same number of commas

Example of WRONG:
```csv
name,description,event_date,start_time,end_time,location,positions_total
Registration,Check in,2026-06-15,07:00,09:00,4
```
Missing location column!

Example of CORRECT:
```csv
name,description,event_date,start_time,end_time,location,positions_total
Registration,Check in,2026-06-15,07:00,09:00,Main tent,4
```

### "Date must be in YYYY-MM-DD format" error

**Problem:** Wrong date format  
**Fix:** Convert dates:
- 06/15/2026 → 2026-06-15
- 15-Jun-2026 → 2026-06-15
- June 15 2026 → 2026-06-15

### "Start time must be before end time" error

**Problem:** Times are backwards or same  
**Fix:** Make sure start < end:
- ❌ 09:00 to 07:00
- ✅ 07:00 to 09:00

### Some rows import, others fail

**This is okay!** The system will:
- ✅ Import all valid rows
- ❌ Show errors for invalid rows
- You can fix the errors and import those rows separately

---

## Google Sheets Integration (Future)

Currently you need to:
1. Create roles in Google Sheets
2. Download as CSV
3. Upload to the system

**Future enhancement:** Direct Google Sheets API integration to import without downloading.

---

## Best Practices

1. **Test with small batch first** (5-10 roles) before uploading 50+
2. **Use the template** as your starting point
3. **Keep a backup** of your CSV before uploading
4. **Check preview** before clicking Import
5. **Use consistent naming** (e.g., "Course Marshal - Corner X")
6. **Add descriptions** - helps volunteers understand the role
7. **Include locations** - volunteers need to know where to go

---

## CSV Template Download

A pre-formatted template is available at:
`/public/volunteer-roles-template.csv`

Or click **"Download CSV Template"** in the Bulk Upload dialog.

---

## Example: Full Race Day Upload

```csv
name,description,event_date,start_time,end_time,location,positions_total
Setup Crew,Help set up tents and signage,2026-06-15,05:30,07:30,Main event area,6
Registration - Early,Check in early arrivals,2026-06-15,06:30,08:30,Registration tent,3
Registration - Peak,Handle peak registration,2026-06-15,08:00,10:00,Registration tent,4
Parking - Morning,Direct incoming cars,2026-06-15,06:00,09:00,Parking lot entrance,2
Course Marshal - Start,Manage start line,2026-06-15,08:00,09:30,Start line,3
Course Marshal - Mile 5,Monitor riders at mile 5,2026-06-15,08:30,11:30,Corner of Main & Oak,2
Course Marshal - Mile 10,Monitor riders at mile 10,2026-06-15,08:45,12:00,Park entrance,2
Water Station 1,Serve water at station 1,2026-06-15,08:30,11:30,Mile 8 marker,4
Water Station 2,Serve water at station 2,2026-06-15,09:00,12:00,Mile 15 marker,4
Finish Line - Timing,Assist with race timing,2026-06-15,09:00,13:00,Finish line,2
Finish Line - Support,Direct finishers and hand out medals,2026-06-15,09:00,13:00,Finish line,4
Medical Support,First aid assistance,2026-06-15,07:00,14:00,Medical tent,2
Food Service,Serve post-race food,2026-06-15,11:00,14:00,Food tent,5
Cleanup Crew,Clean up after event,2026-06-15,13:00,16:00,All areas,8
```

This creates 14 roles in one upload! 🚀

