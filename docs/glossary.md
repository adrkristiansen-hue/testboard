# Glossary – TestBoard concepts and Azure Boards

TestBoard deliberately follows Azure Boards so people who know it feel at home.
This table maps each concept to its Azure Boards counterpart and the Norwegian
term used in the UI.

| TestBoard | Norwegian UI | Azure Boards | Notes |
| --- | --- | --- | --- |
| Project | Prosjekt | Project | One implementation (e.g. "Client X – SuccessFactors"). |
| Work item | Arbeidselement | Work item | Anything tracked: test task, defect, question, change request, task. |
| Work item type | Arbeidselementtype | Work item type | Each type has its own states, allowed transitions and custom fields. |
| Test task | Testoppgave | Test Case (Azure Test Plans) | Test steps, expected result, outcome (Not run / Passed / Failed / Blocked), test data. |
| Defect | Feil | Bug | Severity 1–4, steps to reproduce, expected/actual behaviour, environment. |
| Question | Spørsmål | Issue / Impediment | Open questions to the business or the partner. |
| Change request | Endringsforespørsel | Feature / custom type | Business justification, estimate, decision. |
| State | Status | State | E.g. Not started, In test, Passed, Failed, Blocked. |
| State category | Statuskategori | State category | Proposed, In Progress, Resolved, Completed, Removed – used by boards and reports. |
| Workflow (transitions) | Arbeidsflyt | Process / workflow rules | Which state changes are allowed. Enforced in the UI, bulk edit, import and API. |
| Module | Modul | Area path | Tree such as "Employee Central > Hire". Routes work to team boards. |
| Phase | Fase | Iteration path | SIT 1, SIT 2, UAT … with optional start/end dates (used by burn-down). |
| Team | Team | Team | People plus the modules they own. |
| Board | Board / tavle | Board (Kanban) | One per team; shows work items in the team's modules. |
| Board column | Kolonne | Board column | Maps one or more states per type; optional Doing/Done split and WIP limit. |
| Doing / Done split | Pågår / Ferdig | Split columns | A flag on the item, shared across boards. |
| WIP limit | WIP-grense | WIP limit | Shown on the column header and in board reports. |
| Swimlane | Svømmebane | Swimlane | By module, assignee, priority or custom rules. |
| Card settings | Kortoppsett | Card customization (fields, styles) | Fields on cards and colour rules. |
| Parent / child | Forelder / barn | Parent / Child link | E.g. a defect under the test task it was found in. |
| Related / Blocks / Duplicate of | Relatert / Blokkerer / Duplikat av | Related / Predecessor-Successor / Duplicate | Non-hierarchical links. |
| Discussion | Diskusjon | Discussion | Comments with @mentions, #ID references and reactions. |
| History | Historikk | History | Field-level change log. |
| Follow | Følg | Follow | Get notified about changes to an item. |
| Notifications | Varsler | Notifications / alerts | Assigned, mentioned, state changed, commented. |
| My work | Mitt arbeid | Work items hub ("Assigned to me", "Following", "Mentioned") | Across all projects. |
| Work item list | Arbeidselementer | Backlog / work items hub | Filters, columns, tree view, inline and bulk edit. |
| Saved query | Lagret spørring | Query (My queries / Shared queries) | Flat or tree; can be used as a board filter. |
| Dashboard | Dashbord | Dashboard + Analytics widgets | Per project, phase or board. |
| Cumulative flow | Kumulativ flyt | Cumulative flow diagram | By state category or by board column. |
| Burn-down | Nedbrenning | Burndown | Test tasks not yet passed in a phase. |
| Process template | Prosessmal | Process (inherited process) | Copy of modules, phases, types/workflows/fields and boards. |
| API token | API-nøkkel | Personal access token (PAT) | Acts as the user, with the user's role. |
| Audit log | Revisjonslogg | Auditing | Logins, configuration changes, tokens, imports, deletions. |
| Global roles: Admin, Test Lead, Member, Read-only | Administrator, Testleder, Medlem, Lesetilgang | Organization owner / Project Collection Administrators | System-wide; Test Lead may create projects, Read-only can never change anything. |
| Project member | Prosjektmedlem | Project member (Contributors/Readers group) | Only members can open a project. |
| Project role | Prosjektrolle | Security group with permissions | Per project; default Project lead, Consultant, Customer tester, Read-only; editable permission matrix. |
| Permission | Rettighet | Permission (Allow/Deny) | E.g. create, edit own, edit all, change state, close, assign, delete, internal comments. |
| Locked board | Låst board | Area path security ("View work items in this node") | Items in its modules are only visible to the board's members. |
| Internal comment | Intern kommentar | – (no direct equivalent) | Hidden from roles without "internal comments", e.g. customers. |
| Organisation | Organisasjon | – (Entra ID tenant / guest) | The company a user belongs to; one is marked internal. |
| Invite link | Invitasjonslenke | Invite user / guest invitation | One-time link to set a password, valid 14 days. |
| Microsoft sign-in | Microsoft-pålogging | Microsoft Entra ID authentication | For staff in allowed domains. |
| SIT | SIT | – | System Integration Test: consultants and key users test configured processes end to end. |
| UAT | UAT | – | User Acceptance Test: the business confirms the solution works for them. |
