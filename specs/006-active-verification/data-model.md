# Data Model: Active Verification (UI Shell)

**Feature**: 006-active-verification
**Date**: 2026-02-06

## MVP Scope

**No database entities are created for the UI shell MVP.** This document defines the frontend-only data structures used by components.

## Frontend Data Structures

### Integration (static data)

```typescript
// frontend/src/data/integrations.ts

export type IntegrationStatus = 'available' | 'coming_soon';

export type IntegrationCategory =
  | 'Cold Email'
  | 'E-mail sequencing'
  | 'Automation';

export interface Integration {
  /** Unique identifier (e.g., "reachinbox", "smartlead") */
  id: string;
  /** Display name (e.g., "Reachinbox", "Smartlead") */
  name: string;
  /** Category label shown below the name */
  category: IntegrationCategory;
  /** Path to the SVG logo asset */
  logoSrc: string;
  /** Whether the integration is available or coming soon */
  status: IntegrationStatus;
}
```

### Integration Registry (static array)

```typescript
export const integrations: Integration[] = [
  {
    id: 'reachinbox',
    name: 'Reachinbox',
    category: 'Cold Email',
    logoSrc: '/icons/integrations/reachinbox.svg',
    status: 'coming_soon',
  },
  {
    id: 'smartlead',
    name: 'Smartlead',
    category: 'Cold Email',
    logoSrc: '/icons/integrations/smartlead.svg',
    status: 'coming_soon',
  },
  {
    id: 'instantly',
    name: 'Instantly',
    category: 'Cold Email',
    logoSrc: '/icons/integrations/instantly.svg',
    status: 'coming_soon',
  },
  {
    id: 'reply',
    name: 'Reply',
    category: 'Cold Email',
    logoSrc: '/icons/integrations/reply.svg',
    status: 'coming_soon',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'E-mail sequencing',
    logoSrc: '/icons/integrations/mailchimp.svg',
    status: 'coming_soon',
  },
  {
    id: 'make',
    name: 'Make',
    category: 'Automation',
    logoSrc: '/icons/integrations/make.svg',
    status: 'coming_soon',
  },
  {
    id: 'mixmax',
    name: 'Mixmax',
    category: 'E-mail sequencing',
    logoSrc: '/icons/integrations/mixmax.svg',
    status: 'coming_soon',
  },
  {
    id: 'outreach',
    name: 'Outreach',
    category: 'E-mail sequencing',
    logoSrc: '/icons/integrations/outreach.svg',
    status: 'coming_soon',
  },
];
```

## Deferred Entities (Future — Backend)

The following database entities are documented in the spec for future implementation when provider integrations are built. They are **not created at MVP**.

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| Integration | User's connection to an external tool | id, userId, sourceId, encryptedCredentials, status, lastSyncAt |
| IntegrationEmail | Synced email record | id, integrationId, email, verificationStatus, score, reasonCode, lastVerifiedAt, sourceListName |
| VerificationSchedule | Recurring verification config | id, integrationId, interval, isActive, nextRunAt |
| VerificationCycle | Completed verification run | id, integrationId, startedAt, completedAt, totalEmails, statusCounts, creditsConsumed |
| CleanupOperation | Batch removal action | id, integrationId, emailsSelected, emailsSucceeded, emailsFailed, createdAt, status |

## State Management

### Page State (`/home/active-verification`)

```typescript
interface ActiveVerificationPageState {
  /** Whether the connect modal is open */
  isModalOpen: boolean;
}
```

### Modal State (`ConnectModal`)

```typescript
interface ConnectModalState {
  /** Current search query for filtering integration cards */
  searchQuery: string;
  /** Filtered list of integrations (derived from searchQuery) */
  filteredIntegrations: Integration[];
}
```

No global state management (Redux, Zustand, etc.) is needed. Local `useState` hooks are sufficient for the modal open/close toggle and search input.
