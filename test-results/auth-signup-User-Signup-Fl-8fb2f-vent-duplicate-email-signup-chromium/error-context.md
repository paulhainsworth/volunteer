# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - link "🚴 Volunteer Manager" [ref=e7] [cursor=pointer]:
        - /url: /
      - generic [ref=e8]:
        - link "Login" [ref=e9] [cursor=pointer]:
          - /url: "#/auth/login"
        - link "Sign Up" [ref=e10] [cursor=pointer]:
          - /url: "#/auth/signup"
  - main [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "Volunteer Opportunities" [level=1] [ref=e14]
        - paragraph [ref=e15]: Find a role that fits your schedule and interests
      - generic [ref=e16]:
        - textbox "Search roles..." [ref=e17]
        - combobox [ref=e18]:
          - option "Sort by Date" [selected]
          - option "Sort by Name"
          - option "Sort by Duration"
        - combobox [ref=e19]:
          - option "All Roles" [selected]
          - option "Available Only"
          - option "Urgent Need"
        - textbox [ref=e20]:
          - /placeholder: Filter by date
      - paragraph [ref=e22]: No volunteer opportunities found matching your filters.
  - contentinfo [ref=e23]:
    - paragraph [ref=e24]: © 2025 Berkeley Bicycle Club. All rights reserved.
```