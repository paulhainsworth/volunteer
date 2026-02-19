# 🚴 Race Volunteer Management System

A modern, full-featured web application for managing race volunteers at bicycle events. Built with Svelte, Supabase, and deployed on Vercel.

## ✨ Features

### For Race Organizers (Admins)
- 📊 **Dashboard**: Real-time overview of volunteer signups and fill rates
- 📋 **Role Management**: Create, edit, duplicate, and delete volunteer roles
- 👥 **Volunteer Tracking**: View all volunteers and their commitments
- 📧 **Communications**: Email volunteers with merge fields (UI ready, needs backend integration)
- 📈 **Reporting**: Export volunteer data and rosters to CSV
- ⚠️ **Alerts**: Identify roles that need attention (understaffed, approaching event date)

### For Volunteers
- 🔍 **Browse Opportunities**: Filter and search available volunteer roles
- ✍️ **Easy Signup**: Simple 2-minute signup process
- 📝 **Digital Waivers**: One-time waiver signing with digital signature
- 📅 **My Signups**: Track all volunteer commitments
- 📲 **Calendar Export**: Download events to personal calendar (iCal)
- 🔗 **Share Roles**: Share specific opportunities with friends

## 🛠️ Tech Stack

- **Frontend**: Svelte 5 + Vite
- **Routing**: svelte-spa-router
- **Database & Auth**: Supabase (PostgreSQL + Row Level Security)
- **Styling**: Component-scoped CSS + CSS variables
- **Deployment**: Vercel
- **Date Handling**: date-fns

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A Supabase account (free)
- A Vercel account (free)

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd my-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project
   - Run the SQL schema from `SUPABASE_SCHEMA.sql`
   - Copy your project URL and anon key

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Supabase credentials

5. **Run locally**
   ```bash
   npm run dev
   ```

6. **Create default admin account**
   - In Supabase: Authentication → Add user
   - Email: `admin@admin.com`, Password: `admin`, Auto Confirm: ✅
   - Run SQL: `UPDATE profiles SET role = 'admin' WHERE email = 'admin@admin.com';`
   - Login with admin@admin.com / admin
   - ⚠️ Change password immediately!

📖 **Full setup instructions**: See [SETUP.md](./SETUP.md)

## 📂 Project Structure

```
my-website/
├── src/
│   ├── lib/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Layout.svelte
│   │   │   └── RoleForm.svelte
│   │   ├── stores/            # Svelte stores (state management)
│   │   │   ├── auth.js
│   │   │   ├── roles.js
│   │   │   ├── volunteers.js
│   │   │   ├── signups.js
│   │   │   └── waiver.js
│   │   └── supabaseClient.js  # Supabase configuration
│   ├── routes/                # Page components
│   │   ├── admin/             # Admin dashboard, roles, volunteers
│   │   ├── volunteer/         # Browse roles, signup, my signups
│   │   ├── auth/              # Login, signup, password reset
│   │   └── Home.svelte
│   ├── App.svelte             # Main app with router
│   ├── app.css                # Global styles
│   └── main.js                # Entry point
├── SUPABASE_SCHEMA.sql        # Database schema
├── vercel.json                # Vercel configuration
└── README.md
```

## 🗄️ Database Schema

The system uses 7 main tables:

- **profiles**: User information (extends Supabase auth)
- **volunteer_roles**: Event roles and positions
- **signups**: Volunteer → role assignments
- **waivers**: Signed liability waivers
- **waiver_settings**: Current waiver text/version
- **emails_sent**: Email history (for future use)

Row Level Security (RLS) policies ensure:
- Volunteers can only see/edit their own data
- Admins have full access
- Public can view available roles

## 🎨 Design Philosophy

- **Mobile-first**: Volunteers primarily sign up on phones
- **Admin efficiency**: Minimize clicks for common admin tasks
- **Clear status indicators**: Color-coded fill rates and urgency markers
- **Accessible**: WCAG AA compliant color contrast
- **Fast**: Optimized bundle size, lazy loading, client-side routing

## 🔒 Security

✅ **Implemented**:
- Supabase authentication with secure sessions
- Row Level Security on all database tables
- Admin-only routes protected
- Waiver requirement before signup
- Input validation on forms

## 📦 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables
4. Deploy!

Auto-deploys on push to main branch. In Vercel, the **production domain** (e.g. www.berkeleyomnium.com) is tied to the **Production Branch** (usually `main`). Pushes to other branches (e.g. `omnium2026`) create **Preview** deployments only (separate URLs), not the live site.

### Manual Build

```bash
npm run build
npm run preview  # Test production build locally
```

## 📋 Roadmap

### MVP (Complete ✅)
- [x] Admin dashboard
- [x] Role management
- [x] Volunteer signup flow
- [x] Waiver system
- [x] CSV exports
- [x] Authentication

### v1.1 (Planned)
- [ ] Email sending integration (SendGrid/Resend)
- [ ] Scheduled reminder emails
- [ ] Email verification for signups
- [ ] Event templates (copy from previous events)
- [ ] Bulk role creation from CSV

### v2.0 (Future)
- [ ] SMS notifications (Twilio)
- [ ] QR code check-in on event day
- [ ] Volunteer hours tracking
- [ ] Multi-event management
- [ ] Volunteer preferences and availability
- [ ] Shift trading between volunteers

## 🤝 Contributing

This is a custom project for Berkeley Bicycle Club. If you'd like to adapt it for your organization:

1. Fork the repository
2. Update branding and copy
3. Customize the feature set
4. Deploy to your own Supabase + Vercel

## 📄 License

MIT License - see LICENSE file for details

## 🙋 Support

For setup help, see [SETUP.md](./SETUP.md)

For bug reports or feature requests, please open an issue.

---

Built with ❤️ for the cycling community
