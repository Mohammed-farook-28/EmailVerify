# Landing Page (Public)

## Route
`/` (redirects to `/home` when logged in)

## Page Title
Free Email Checker & Email Verification | EmailVerify

## Overview
The public-facing landing page showcases EmailVerify's email verification services, features, pricing, integrations, and customer testimonials. It serves as the main marketing and conversion page.

---

## Top Banner
- **Promotion**: "🎉 Launch Offer: up to 97.2% OFF credits."
- **CTA Button**: "See Plans" → `/pricing`

---

## Header Navigation

### Logo
- EmailVerify logo (links to homepage)

### Main Navigation Menu
| Item | Type | Link | Badge |
|------|------|------|-------|
| Product | Dropdown | - | - |
| Free Tools | Dropdown | - | - |
| AI Guides | Dropdown | - | - |
| Pricing | Link | /pricing | "New" (red badge) |
| Whitelabel | Link | /whitelabel | "New" (red badge) |

#### Product Dropdown Contents
| Item | Link |
|------|------|
| Email Verification | /email-verification |
| Bulk Email Verification | /bulk-email-verification |
| Email Validation API | /email-validation-api |

#### Free Tools Dropdown Contents
| Item | Link | Badge |
|------|------|-------|
| Email Extractor | /email-extractor | "New" |
| Email Checker | /email-checker | - |
| Email List Cleaning | /email-list-cleaning | - |
| Disposable Email Detection | /disposable-email-detection | - |
| Bounce Email Checker | /bounce-email-checker | - |
| Role Account Detection | /role-account-detection | - |
| Catch-All Verifier | /catch-all-verifier | - |

#### AI Guides Dropdown Contents
| Item | Link |
|------|------|
| MCP Server | /mcp |
| Agent Skills | /agent-skills |

### Right Side
- **Language Selector**: Dropdown with flag icons (16 languages)
- **Profile Menu**: User avatar button (circular, shows initial when logged in)

#### Language Options (16 languages)
| Flag | Language | Code |
|------|----------|------|
| 🇺🇸 | English | en |
| 🇨🇳 | 简体中文 | zh-CN |
| 🇭🇰 | 繁體中文 | zh-TW |
| 🇪🇸 | Español | es |
| 🇯🇵 | 日本語 | ja |
| 🇫🇷 | Français | fr |
| 🇩🇪 | Deutsch | de |
| 🇮🇹 | Italiano | it |
| 🇵🇱 | Polski | pl |
| 🇮🇳 | हिंदी | hi |
| 🇲🇾 | Melayu | ms |
| 🇵🇹 | Português | pt |
| 🇮🇩 | Indonesia | id |
| 🇷🇺 | Русский | ru |
| 🇰🇷 | 한국어 | ko |
| 🇳🇱 | Nederlands | nl |

#### Profile Menu (When Logged In)
| Item | Type | Action |
|------|------|--------|
| Signed in as [email] | Label | Display only |
| Dashboard | Link | /home |
| Documentation | Link | External docs |
| Theme | Submenu | Light / Dark / System |
| Sign out | Button | Logout action |

---

## Hero Section

### Badge
- "Over 1 billion emails verified with 99.9% accuracy" → `/auth/sign-up`

### Headlines
- **H1**: "Free Email Checker Better Deliverability"
- **H2**: "Every email delivered accurately. EmailVerify provides enterprise-grade email verification to boost deliverability, protect reputation, and maximize ROI."

### CTAs
- **Primary**: "Get Started" → `/auth/sign-up`

---

## Popular Features Section

### Title
"Popular Features"

### Feature Links
| Feature | Link |
|---------|------|
| Free Email Checker | /email-checker |
| Bulk Email Verification | /bulk-email-verification |
| Email Validation API | /email-validation-api |
| Disposable Email Detection | /disposable-email-detection |
| Catch-All Detector | /catch-all-verifier |
| Role Account Filter | /role-account-detection |
| Email List Cleaning | /email-list-cleaning |

---

## All-in-One Solution Section

### Headline
"Zero bounces. Maximum deliverability. Enterprise-grade email verification."

### Features

#### 1. Bulk Email Verification
- **Link**: /bulk-email-verification
- **Description**: "Upload CSV or Excel files to quickly verify millions of email addresses with real-time progress tracking."

#### 2. Real-time API Verification
- **Link**: /email-validation-api
- **Description**: "Powerful RESTful API with millisecond response times, easily integrate into your applications and workflows."

#### 3. Smart Detection Technology
- **Link**: /email-checker
- **Description**: "SMTP verification, disposable email detection, spam trap identification - multi-layer verification ensures accuracy."

#### 4. Detailed Verification Reports
- **Description**: "Get comprehensive verification results analysis including risk scores, statistics, and optimization recommendations."
- **CTA**: "Get Started" → `/auth/sign-up`

#### 5. Multi-Platform Integration
- **Link**: /integrations
- **Description**: "Seamlessly integrate with 20+ major email marketing platforms to optimize your workflow."

---

## Statistics Section

| Metric | Value | Label |
|--------|-------|-------|
| Emails Verified | 1B+ | Emails Verified |
| Accuracy Rate | 99.9% | Accuracy Rate |
| API Response | 50ms | API Response |
| Enterprise Customers | 5000+ | Enterprise Customers |

---

## Advanced Protection Section

### Title
"Comprehensive Email Validation"

### Description
"Our email checker goes beyond basic validation to detect problematic addresses before they harm your sender reputation."

### Features

#### 1. Disposable Email Detection
- **Link**: /disposable-email-detection
- **Description**: "Automatically identify and filter temporary email addresses used for spam or fake signups."
- **Benefits**:
  - Block throwaway email domains
  - Reduce fake account registrations
  - Improve user engagement rates

#### 2. Role-Based Email Detection
- **Link**: /role-account-detection
- **Description**: "Identify generic addresses like info@, support@, or admin@ that often have low engagement."
- **Benefits**:
  - Target real decision makers
  - Improve email open rates
  - Better personalization potential

#### 3. Catch-All Domain Verification
- **Link**: /catch-all-verifier
- **Description**: "Detect domains configured to accept all emails, which can hide invalid addresses."
- **Benefits**:
  - Identify risky domains
  - Better bounce prediction
  - Reduce wasted sends

#### 4. Spam Trap Detection
- **Link**: /bounce-email-checker
- **Description**: "Protect your sender reputation by identifying known spam trap addresses before sending."
- **Benefits**:
  - Protect sender reputation
  - Avoid blacklisting
  - Maintain deliverability

#### 5. MCP Server Integration
- **Link**: /mcp
- **Description**: "Connect AI assistants like Claude and Cursor to our email verification API through the Model Context Protocol."
- **Benefits**:
  - Seamless AI integration
  - Real-time verification in chat
  - No coding required

#### 6. AI Agent Skills
- **Link**: /agent-skills
- **Description**: "Pre-built skills for AI agents to verify emails directly within their workflows and automations."
- **Benefits**:
  - Works with Claude, Manus, etc.
  - One-click installation
  - Automatic email validation

---

## Performance Section

### Title
"Built for Performance"

### Subtitle
"Enterprise-grade email verification infrastructure designed for speed and reliability."

| Metric | Value | Description |
|--------|-------|-------------|
| Verification Speed | 50ms | Average response time |
| Accuracy Rate | 99.9% | Industry-leading precision |
| Service Uptime | 99.99% | Guaranteed availability |
| Global Coverage | 200+ | Countries supported |

---

## Business Scenarios Section

### Title
"For Every Business Scenario"

### Subtitle
"Whether you're an e-commerce platform, SaaS company, or marketing agency, EmailVerify meets your needs"

### Scenarios

#### 1. E-commerce Platforms
- **Icon**: 🛒
- **Description**: "Improve promotional email deliverability and reduce cart abandonment email bounces"

#### 2. SaaS Companies
- **Icon**: 💻
- **Description**: "Verify emails at user registration to improve trial conversion rates and user quality"

#### 3. Marketing Agencies
- **Icon**: 📊
- **Description**: "Provide email list cleaning services for clients to improve campaign effectiveness"

---

## Integrations Section

### Title
"Works With Your Favorite Tools"

### Description
"Connect EmailVerify to your existing workflow. Native integrations with popular email marketing platforms and CRMs."

### Integration Partners
| Platform | Link |
|----------|------|
| Mailchimp | /integrations/mailchimp |
| SendGrid | /integrations/sendgrid |
| HubSpot | /integrations/hubspot |
| Salesforce | /integrations/salesforce |
| ActiveCampaign | /integrations/activecampaign |
| ConvertKit | - |
| Klaviyo | /integrations/klaviyo |
| Brevo | - |
| GetResponse | - |
| Constant Contact | - |
| Zapier | /integrations/zapier |
| Make | /integrations/make |

- **CTA**: "View all integrations" → `/integrations`

---

## Testimonials Section

### Title
"What Our Customers Say"

### Subtitle
"See why thousands of businesses trust EmailVerify for their email verification needs"

### Customer Categories
- Marketing
- E-commerce
- SaaS
- Sales
- Enterprise
- Automation
- Email Marketing

### Featured Customers
- Mailchimp Customer
- SendGrid Customer
- Klaviyo Customer
- Shopify Merchant
- Slack Customer
- Clay Customer
- Apollo Customer
- ZoomInfo Customer
- Salesforce Customer
- HubSpot Customer
- Brevo Customer
- Zapier Customer
- ActiveCampaign Customer
- GetResponse Customer
- ConvertKit Customer

---

## CTA Section (Bottom)

### Headline
"Join thousands of businesses using EmailVerify to improve email deliverability, reduce bounce rates, and protect sender reputation."

### Offer
"Get started with 10 free credits - no credit card required."

### CTAs
- **Primary**: "Start Free Trial Now" → Sign up
- **Secondary**: "Try Email Verification"

### Trust Signals
- No credit card required
- 100+ free credits daily
- Start verifying in 30 seconds

---

## Footer

### Brand Section
- EmailVerify logo (links to homepage)
- **Tagline**: "Verify emails in real-time with 99.9% accuracy. Stop bounces, protect your sender reputation, and reach real people. Trusted by 10,000+ businesses worldwide."

### Social Links / Browser Extensions
| Platform | Link |
|----------|------|
| Chrome Extension | https://chromewebstore.google.com/detail/email-extractor-by-emailv/fplaepdipjjpkngejlakmcjkokghhndj |
| Firefox Extension | https://addons.mozilla.org/en-US/firefox/addon/email-extractor-emailverify-ai/ |
| GitHub | https://github.com/emailverify-ai |
| Product Hunt | https://www.producthunt.com/products/emailverify |

### Copyright
"© Copyright 2026 EmailVerify. All Rights Reserved."

### Footer Links

#### Product
| Item | Link |
|------|------|
| Features | /features |
| Email Verification | /email-verification |
| Bulk Email Verification | /bulk-email-verification |
| Email Validation API | /email-validation-api |

#### AI Guides
| Item | Link |
|------|------|
| MCP Server | /mcp |
| Agent Skills | /agent-skills |

#### Free Tools
| Item | Link |
|------|------|
| Free Email Extractor Online | /email-extractor |
| Email List Cleaning | /email-list-cleaning |
| Free Email Checker | /email-checker |
| Disposable Email Detection | /disposable-email-detection |
| Email Bounce Checker | /bounce-email-checker |
| Catch-All Detector | /catch-all-verifier |
| Role Account Filter | /role-account-detection |

#### Services
| Item | Link |
|------|------|
| Whitelabel Service | /whitelabel |
| Integrations | /integrations |
| Mailchimp Integration | /integrations/mailchimp |
| HubSpot Integration | /integrations/hubspot |
| Salesforce Integration | /integrations/salesforce |
| SendGrid Integration | /integrations/sendgrid |

#### Comparisons
| Item | Link |
|------|------|
| Comparisons | /vs |
| EmailVerify vs NeverBounce | /vs/neverbounce |
| EmailVerify vs ZeroBounce | /vs/zerobounce |
| EmailVerify vs Hunter | /vs/hunter |
| EmailVerify vs Bouncer | /vs/bouncer |

#### Resources
| Item | Link |
|------|------|
| Documentation | /docs |
| EmailVerify Blog | /blog |
| Email Glossary | /glossary |
| Email Verification FAQs | /faq |

#### Company
| Item | Link |
|------|------|
| About EmailVerify | /about |
| Privacy Policy | /privacy |
| Terms of Service | /terms |
| Cookie Policy | /cookie-policy |

---

## Key URLs Discovered

### Product Pages
- /email-checker
- /bulk-email-verification
- /email-validation-api
- /disposable-email-detection
- /catch-all-verifier
- /role-account-detection
- /email-list-cleaning
- /bounce-email-checker

### Special Features
- /mcp (MCP Server Integration)
- /agent-skills (AI Agent Skills)
- /whitelabel (Whitelabel Solution)

### Integration Pages
- /integrations
- /integrations/mailchimp
- /integrations/sendgrid
- /integrations/hubspot
- /integrations/salesforce
- /integrations/activecampaign
- /integrations/klaviyo
- /integrations/zapier
- /integrations/make

### Other Pages
- /pricing
- /auth/sign-up
