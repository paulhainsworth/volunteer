# ⭐ Volunteer Leader Role Feature

## Overview

The Volunteer Leader role creates a management hierarchy between admins and volunteers:

**Admin** → **Volunteer Leader** → **Volunteer**

---

## Three Role Types

### 👑 Admin
- Full system access
- Create/edit all roles
- Manage all users
- Assign volunteer leaders
- Send communications
- View all data

### ⭐ Volunteer Leader
- View assigned roles only
- See volunteers for their roles
- Contact their volunteers
- Still can browse and signup for other roles
- Cannot create/edit roles
- Cannot access admin functions

### 👤 Volunteer
- Browse available roles
- Sign up for roles
- Manage own signups
- View own schedule

---

## Setup Instructions

### 1. Run Database Migration

Run `ADD_VOLUNTEER_LEADER_ROLE.sql` in Supabase SQL Editor:

This will:
- Add `leader_id` column to `volunteer_roles` table
- Update role constraints to include `volunteer_leader`
- Add RLS policies for volunteer leaders
- Create indexes for performance

### 2. Create Volunteer Leaders

As an admin:
1. Go to **Users** page
2. Find a user
3. Click **"Make Leader"** button
4. They now have Volunteer Leader role!

### 3. Assign Leaders to Roles

**Option A: When creating a role**
1. Go to **Roles** → **Create Role**
2. Fill in role details
3. Select a **Volunteer Leader** from dropdown
4. Save

**Option B: Edit existing role**
1. Go to **Roles** → Click **Edit** on a role
2. Select a **Volunteer Leader** from dropdown
3. Save

**Option C: Bulk upload with CSV**
1. In your CSV, add `leader_email` column
2. Put the leader's email address
3. System will auto-assign on import

---

## How Volunteer Leaders Use the System

### As a Volunteer Leader:

**1. Login**
- Use your normal credentials
- You'll see "My Roles" in the navbar

**2. View Your Dashboard**
- Click **"My Roles"**
- See all roles assigned to you
- View fill rates and statistics

**3. Monitor Signups**
- See who signed up for each role
- View volunteer contact information
- Check fill percentages

**4. Still Volunteer!**
- Leaders can also sign up for other roles
- Browse all opportunities
- Manage their own signups

---

## User Interface

### Volunteer Leader Dashboard

Shows:
- **Stats**: Total roles, positions filled, fill rate, volunteer count
- **Role cards**: Each assigned role with:
  - Role details (date, time, location)
  - Fill status with progress bar
  - List of signed-up volunteers
  - Contact information (email, phone)

### Navigation (Volunteer Leaders see):
- **My Roles** - Their assigned roles
- **Browse Roles** - All available opportunities
- **My Signups** - Their own volunteer commitments

---

## CSV Bulk Upload with Leaders

### CSV Format with Leader Assignment:

```csv
name,description,event_date,start_time,end_time,location,positions_total,leader_email
Registration,Check in riders,2026-06-15,07:00,09:00,Main tent,4,john@example.com
Course Marshal,Direct riders,2026-06-15,08:00,12:00,Corner 1,2,jane@example.com
Water Station,Serve water,2026-06-15,08:30,11:30,Mile 10,3,
```

**How it works:**
- Put the volunteer leader's **email address** in `leader_email` column
- System looks up the user and assigns them
- If email not found or empty, no leader is assigned
- Leader must already exist in system with `volunteer_leader` role

---

## Permissions & Security

### What Volunteer Leaders CAN do:
✅ View roles assigned to them  
✅ See volunteer contact info for their roles  
✅ Check fill status for their roles  
✅ Browse and signup for any role as a volunteer  
✅ Manage their own signups  

### What Volunteer Leaders CANNOT do:
❌ Create or edit roles  
❌ Delete roles  
❌ View roles not assigned to them  
❌ Change user roles  
❌ Send mass emails  
❌ Export full volunteer list  
❌ Access admin dashboard  

---

## Use Cases

### Perfect for:

1. **Large Events** - Distribute management across multiple leaders
2. **Multi-Location Events** - Each location has a leader
3. **Department Heads** - Registration leader, Course leader, Food service leader
4. **Experienced Volunteers** - Promote trusted volunteers to leadership
5. **Training** - New coordinators can start as leaders before becoming admins

### Example Hierarchy:

```
Admin (Race Director)
├── Volunteer Leader (Registration Coordinator)
│   ├── Registration - Early shift (4 volunteers)
│   ├── Registration - Late shift (4 volunteers)
│   └── Number pickup (2 volunteers)
│
├── Volunteer Leader (Course Coordinator)
│   ├── Course Marshal - Start line (3 volunteers)
│   ├── Course Marshal - Corner 1 (2 volunteers)
│   ├── Course Marshal - Corner 2 (2 volunteers)
│   └── Course Marshal - Finish (3 volunteers)
│
└── Volunteer Leader (Support Services)
    ├── Water Station 1 (4 volunteers)
    ├── Water Station 2 (4 volunteers)
    └── Medical tent (2 volunteers)
```

---

## Workflow

### For Race Directors (Admins):

1. **Before event setup:**
   - Identify experienced volunteers for leadership
   - Make them Volunteer Leaders in Users page

2. **During role creation:**
   - Assign leaders to roles
   - Or bulk upload CSV with leader assignments

3. **Delegation:**
   - Leaders can monitor their roles
   - Admins still have full oversight

### For Volunteer Leaders:

1. **Check dashboard regularly:**
   - See which roles need volunteers
   - Track fill rates

2. **Recruit volunteers:**
   - Share role links with potential volunteers
   - Contact people directly

3. **On event day:**
   - Have contact info for all their volunteers
   - Can text/call if someone is late

---

## Database Schema

### New Column in `volunteer_roles`:
```sql
leader_id UUID REFERENCES profiles(id)
```

### Updated Constraint in `profiles`:
```sql
role IN ('admin', 'volunteer_leader', 'volunteer')
```

---

## Migration Path

### Existing Systems:
1. Run `ADD_VOLUNTEER_LEADER_ROLE.sql`
2. Existing roles will have `leader_id = NULL` (no leader)
3. Gradually assign leaders as needed
4. Promote suitable volunteers to leader role

### New Systems:
1. Include in initial schema setup
2. Create volunteer leaders early
3. Assign during role creation

---

## Testing the Feature

1. **Create a volunteer leader:**
   - Sign up as volunteer
   - Admin promotes to volunteer_leader

2. **Assign roles to leader:**
   - Edit existing roles
   - Select the leader from dropdown

3. **Test leader dashboard:**
   - Login as volunteer leader
   - Click "My Roles"
   - Should see assigned roles

4. **Verify permissions:**
   - Leader should NOT see admin links
   - Leader should NOT be able to edit roles directly
   - Leader CAN see volunteer contact info

---

## Benefits

✅ **Scalability** - Distribute workload across leaders  
✅ **Accountability** - Clear ownership of each role  
✅ **Better communication** - Leaders have direct contact info  
✅ **Training path** - Grow volunteers into coordinators  
✅ **Event day** - Leaders can manage their areas independently  

---

## Future Enhancements

- [ ] Let leaders send emails to their volunteers
- [ ] Let leaders export their volunteer roster
- [ ] Let leaders see volunteer check-in status
- [ ] Dashboard analytics per leader
- [ ] Leader-to-leader messaging
- [ ] Mobile app for leaders on event day

---

*Volunteer Leader feature is fully functional and ready to use!* 🚀

