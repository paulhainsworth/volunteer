# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - link "🚴 Volunteer Manager" [ref=e7] [cursor=pointer]:
        - /url: "#/"
      - generic [ref=e8]:
        - link "Login" [ref=e9] [cursor=pointer]:
          - /url: "#/auth/login"
        - link "Sign Up" [ref=e10] [cursor=pointer]:
          - /url: "#/auth/signup"
        - button "🌙" [ref=e11] [cursor=pointer]
  - main [ref=e12]:
    - generic [ref=e14]:
      - heading "Sign In" [level=1] [ref=e15]
      - paragraph [ref=e16]: Welcome back to Race Volunteer Manager
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: Email
          - textbox "Email" [ref=e20]:
            - /placeholder: you@example.com
        - generic [ref=e21]:
          - generic [ref=e22]: Password
          - textbox "Password" [ref=e23]:
            - /placeholder: Enter your password
        - button "Sign In" [ref=e24] [cursor=pointer]
      - generic [ref=e25]:
        - link "Forgot password?" [ref=e26] [cursor=pointer]:
          - /url: "#/auth/reset-password"
        - text: ·
        - link "Create account" [ref=e27] [cursor=pointer]:
          - /url: "#/auth/signup"
  - contentinfo [ref=e28]:
    - paragraph [ref=e29]: © 2025 Berkeley Bicycle Club. All rights reserved.
```