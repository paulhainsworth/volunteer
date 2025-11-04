# Volunteer Leader Domains - Usage Guide

## Overview

The domain system organizes volunteer roles into logical groupings (e.g., "Course Marshals", "Registration & Check-in") and assigns a leader to each domain. This creates a clear hierarchy for managing volunteers.

## Setup Required

Before using domains, you **must** run these SQL scripts in Supabase:

1. **COMPLETE_VOLUNTEER_LEADER_SETUP.sql** - Enables volunteer leader role and admin permissions
2. **ADD_LEADER_DOMAINS_SAFE.sql** - Creates the domains table and default domains

## How to Use Domains

### 1. Managing Domains (Admin Only)

Navigate to **Domains** in the admin menu to:

- **View all domains** - See the list of volunteer domains
- **Create new domains** - Add custom domains for your event
- **Assign leaders** - Assign a volunteer leader to manage each domain
- **Assign roles to domains** - Click "Assign Roles" to select which roles belong to each domain

### 2. Creating Roles with Domains

When creating or editing a role, you have two options:

#### Option A: Domain Assignment (Recommended)
- Select a domain from the **"Domain"** dropdown
- The role will inherit the domain's assigned leader
- Example: Assign "Course Marshal - Corner 1" to "Course Marshals" domain

#### Option B: Direct Leader Assignment (Legacy)
- Select a volunteer leader directly from the **"Or Direct Leader Assignment"** dropdown
- Only use this if you don't want to use domains
- This is the old way of assigning leaders

**Note:** If both domain and direct leader are assigned, the domain takes precedence.

### 3. Bulk Upload with Domains

When uploading roles via CSV:

1. Download the CSV template (includes `domain_name` column)
2. Add domain names to your CSV file:
   ```csv
   name,description,event_date,start_time,end_time,location,positions_total,domain_name,leader_email
   Course Marshal - Corner 1,Direct riders,2026-06-15,08:00,12:00,Main St,2,Course Marshals,
   ```
3. The system will automatically look up the domain by name
4. If the domain doesn't exist, a warning is shown but the role is still created

**CSV Columns for Domains:**
- `domain_name` (optional) - The exact name of the domain (e.g., "Course Marshals")
- `leader_email` (optional) - Direct leader assignment (only used if no domain is specified)

### 4. Default Domains

The following domains are created by default:

1. **Registration & Check-in** - Handling rider registration and check-in
2. **Course Marshals** - Directing riders and monitoring the race course
3. **Water Stations & Aid** - Providing water, snacks, and support
4. **Finish Line & Timing** - Managing finish line operations
5. **Loading & Logistics** - Equipment setup and transportation
6. **Food & Hospitality** - Post-race food service
7. **Parking & Traffic** - Directing parking and traffic
8. **Medical & Safety** - First aid and emergency response

You can create additional domains as needed!

## Benefits of Using Domains

1. **Better Organization** - Group related roles together
2. **Clear Leadership** - Each domain has one leader responsible for all roles in that domain
3. **Easier Communication** - Volunteers can contact their domain leader
4. **Scalability** - Add new roles to existing domains without reassigning leaders
5. **Bulk Management** - Assign/reassign multiple roles to a domain at once

## Example Workflow

### Setting Up Course Marshal Roles

1. **Create the Domain**
   - Go to Domains page
   - Create "Course Marshals" domain
   - Assign a volunteer leader (e.g., John Smith)

2. **Assign Roles to Domain**
   - Click "Assign Roles" on the Course Marshals domain
   - Select all course marshal positions from the unassigned list
   - Click "+ Add" to assign them to the domain

3. **Or Create New Roles with Domain**
   - Create a new role: "Course Marshal - Corner 1"
   - Select "Course Marshals" from the domain dropdown
   - The role is automatically linked to John Smith as the leader

4. **Volunteers Contact Their Leader**
   - When a volunteer signs up for "Course Marshal - Corner 1"
   - They can see John Smith as their leader
   - They can send an email directly from their dashboard

## Troubleshooting

### "Domain not found" error during CSV upload
- Check the exact spelling of the domain name in your CSV
- Domain names are case-sensitive
- Create the domain first in the Domains page if it doesn't exist

### Leader not assigned to roles
- Make sure you've assigned a leader to the domain in the Domains page
- If using direct assignment, ensure the email matches a volunteer leader account

### Can't see Domains menu
- Only admins can access the Domains page
- Make sure your account has the "admin" role

## Questions?

If you need help or have questions about domains, refer to the main README.md or check the Supabase schema documentation.

