# Perfex CRM — Project Management module: buildable spec

Research compiled for the Story Advantage BRS funnel tool. This documents Perfex CRM's
**Project Management** side (projects, milestones, tasks, time tracking, files, discussions,
notes, activity) in enough data-model detail to be translated directly into a
Next.js 16 + Prisma 6 + PostgreSQL app.

Perfex itself is a PHP/CodeIgniter app on MySQL with a `tbl` table prefix. Integer-coded
enums and exact column names below were verified against the canonical Perfex source SQL
(two versions), the model files that define the status/billing logic, and the official REST
API JSON. All non-obvious facts are cited inline. See **Sources** at the end.

> Scope note: this is a faithful description of how Perfex works, **followed by** a proposed
> Prisma-oriented model. Story Advantage's BRS gates, planning lanes/sprints, GHL sync, and
> soft-delete/activity conventions are noted where they should diverge from Perfex. We are
> cloning the PM mechanics, not the CRM billing stack.

---

## Entities and fields

Each table below lists Perfex's **exact** MySQL column names (so build agents can recognise
them in the API/source) with a suggested Prisma type and notes. Types shown as `int(11)` in
older Perfex are just `int` in 3.1.0; treat as `Int`. `decimal(15,2)` → Prisma `Decimal`.
Perfex stores most timestamps as MySQL `datetime`; map to `DateTime`. A handful of "columns"
returned by the REST API are **computed**, not stored — these are flagged and should become
derived/aggregate queries, not Prisma columns.

### Project (`tblprojects`)

Verified against `install/database.sql` (v2.4 dump) and `database-3.1.0.sql`, cross-checked
against REST API JSON.

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id @default(autoincrement())` | |
| `name` | varchar(191) NOT NULL | `String` | Visible to customer. |
| `description` | mediumtext | `String?` | |
| `status` | int NOT NULL default 0 | `Int` (or enum) | Project status integer. See enums. |
| `clientid` | int NOT NULL | `Int` | FK → customer. The link to the CRM customer. |
| `billing_type` | int NOT NULL | `Int` (or enum) | 1 fixed / 2 project hours / 3 task hours. |
| `start_date` | date NOT NULL | `DateTime` (date) | |
| `deadline` | date NULL | `DateTime?` (date) | The project end date / due date. |
| `project_created` | date NOT NULL | `DateTime` (date) | Creation date. **API aliases this `customer_created`** but the real column is `project_created`. |
| `date_finished` | datetime NULL | `DateTime?` | Set when project marked Finished. |
| `progress` | int default 0 | `Int @default(0)` | 0–100. Manual unless `progress_from_tasks=1`. |
| `progress_from_tasks` | int NOT NULL default 1 | `Boolean @default(true)` | If true, `progress` is auto-calculated from task completion; if false, set manually. |
| `project_cost` | decimal(15,2) NULL | `Decimal?` | Used when `billing_type=1` (fixed). API aliases `customer_cost`. |
| `project_rate_per_hour` | decimal(15,2) NULL | `Decimal?` | Used when `billing_type=2` (project hours). API aliases `customer_rate_per_hour`. |
| `estimated_hours` | decimal(15,2) NULL | `Decimal?` | Estimate, informational. |
| `addedfrom` | int NOT NULL | `Int` | Staff id who created it. |
| `contact_notification` | int default 1 | `Int @default(1)` | **3.1.0 only.** Which contacts to notify: 0 none / 1 all / 2 selected (drives `notify_contacts`). |
| `notify_contacts` | mediumtext | `String?` | **3.1.0 only.** Serialized contact ids when `contact_notification=2`. |

Corrections to common assumptions: there is **no `responsible_notify`** column; notification is
`contact_notification` + `notify_contacts`. Customer-visibility toggles are **not** columns on
the project — they live in `tblproject_settings` (EAV, see ProjectSetting below). [Source: schema
SQL; REST API JSON shows `billing_type`,`project_cost`,`progress_from_tasks`,`date_finished` etc.]

### Milestone (`tblmilestones`)

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `name` | varchar(191) NOT NULL | `String` | |
| `description` | mediumtext | `String?` | |
| `description_visible_to_customer` | tinyint(1) default 0 | `Boolean @default(false)` | |
| `start_date` | date NULL | `DateTime?` (date) | **3.1.0 only** (used by Gantt). |
| `due_date` | date NOT NULL | `DateTime` (date) | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `color` | varchar(10) NULL | `String?` | Hex colour for the board/Gantt. |
| `milestone_order` | int NOT NULL default 0 | `Int @default(0)` | Sort order; milestones are reorderable. |
| `datecreated` | date NOT NULL | `DateTime` (date) | |
| `hide_from_customer` | int default 0 | `Boolean @default(false)` | **3.1.0 only.** |

**Computed, not stored:** the REST API returns `total_tasks` and `total_finished_tasks` per
milestone, and a derived `progress`. These are aggregates over the milestone's tasks, not
columns — implement as a query/computed field. Tasks attach to a milestone via the task's
`milestone` FK; the UI lets you **drag and drop tasks between milestones** (a Kanban-by-milestone
view), which only changes `task.milestone` / `task.milestone_order`. [Sources: schema SQL; REST
API milestone JSON `total_tasks`/`total_finished_tasks`; CodeCanyon "Drag and Drop tasks between
milestones".]

### Task (`tbltasks`)

Tasks are generic in Perfex: a task relates to a project (or lead/customer/invoice/estimate/
contract/ticket/expense/proposal) via `rel_type`+`rel_id`. For PM, `rel_type='project'`.

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `name` | longtext NOT NULL | `String` | The task subject. |
| `description` | mediumtext | `String?` | |
| `priority` | int NULL | `Int?` (enum) | 1 Low / 2 Medium / 3 High / 4 Urgent. Nullable = none. |
| `dateadded` | datetime NOT NULL | `DateTime` | |
| `startdate` | date NOT NULL | `DateTime` (date) | One word — **not** `start_date`. |
| `duedate` | date NULL | `DateTime?` (date) | One word. |
| `datefinished` | datetime NULL | `DateTime?` | One word. Set when status → Complete. |
| `addedfrom` | int NOT NULL | `Int` | Staff (or contact) id who created it. |
| `is_added_from_contact` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | |
| `status` | int NOT NULL default 0 | `Int` (enum) | Task status integer. See enums. |
| `recurring_type` | varchar(10) NULL | `String?` | day/week/month/year. |
| `repeat_every` | int NULL | `Int?` | Interval count for recurrence. |
| `recurring` | int NOT NULL default 0 | `Int @default(0)` | Recurrence flag. |
| `is_recurring_from` | int NULL | `Int?` | Parent task id if auto-created by recurrence. |
| `cycles` | int NOT NULL default 0 | `Int @default(0)` | Recurrence cycles done. |
| `total_cycles` | int NOT NULL default 0 | `Int @default(0)` | Recurrence cycles limit. |
| `custom_recurring` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | |
| `last_recurring_date` | date NULL | `DateTime?` (date) | |
| `rel_id` | int NULL | `Int?` | Related entity id (project id for PM). |
| `rel_type` | varchar(30) NULL | `String?` | `'project'`, `'lead'`, `'customer'`, `'invoice'`, etc. |
| `is_public` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | Visible to all staff regardless of assignment. |
| `billable` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | |
| `billed` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | Once billed, timers lock; cannot re-bill. |
| `invoice_id` | int NOT NULL default 0 | `Int @default(0)` | **`invoice_id`**, not `invoiceid`. |
| `hourly_rate` | decimal(15,2) NOT NULL default 0 | `Decimal @default(0)` | Per-task rate; basis for Task Hours billing. |
| `milestone` | int default 0 | `Int @default(0)` | FK → Milestone (0 = none). |
| `kanban_order` | int default 1 | `Int @default(1)` | Order within a status column on the task Kanban. |
| `milestone_order` | int NOT NULL default 0 | `Int @default(0)` | Order within its milestone column. |
| `visible_to_client` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | Per-task client visibility. |
| `deadline_notified` | int NOT NULL default 0 | `Int @default(0)` | Due-date reminder sent flag. |

Corrections: there is **no `started`** column and **no task-level `deadline`** column (deadline is
on projects; tasks use `duedate`). [Sources: schema SQL; REST API task JSON confirms
`priority`,`startdate`,`duedate`,`datefinished`,`status`,`recurring_type`,`repeat_every`,
`is_added_from_contact`.]

### TaskAssignee (`tbltask_assigned`)

A task can have **multiple** assignees.

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `taskid` | int NOT NULL | `Int` | One word. FK → Task. |
| `staffid` | int NOT NULL | `Int` | One word. FK → staff/user. |
| `assigned_from` | int NOT NULL default 0 | `Int @default(0)` | Who assigned it. |
| `is_assigned_from_contact` | tinyint(1) NOT NULL default 0 | `Boolean @default(false)` | |

Unique on (`taskid`,`staffid`). [Source: schema SQL.]

### TaskFollower (`tbltask_followers`)

Followers track a task without being assignees, and **may be staff who are not project members**
(they see the task but not the project). [CodeCanyon: "Add task followers even if the staff is
not project member."]

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `taskid` | int NOT NULL | `Int` | FK → Task. |
| `staffid` | int NOT NULL | `Int` | **`staffid`**, not `followerid` (the API aliases it `followerid`). |

Unique on (`taskid`,`staffid`). [Source: schema SQL.]

### TaskChecklistItem (`tbltask_checklist_items`)

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `taskid` | int NOT NULL | `Int` | One word. FK → Task. |
| `description` | mediumtext NOT NULL | `String` | |
| `finished` | int NOT NULL default 0 | `Boolean @default(false)` | |
| `dateadded` | datetime NOT NULL | `DateTime` | |
| `addedfrom` | int NOT NULL | `Int` | |
| `finished_from` | int default 0 | `Int @default(0)` | Staff id who ticked it. |
| `list_order` | int NOT NULL default 0 | `Int @default(0)` | Reorderable. |
| `assigned` | int NULL | `Int?` | **3.1.0 only.** Assignee for the checklist item. |

Reusable checklist templates live in `tbltasks_checklist_templates` (`id`, `description`) and can
be inserted into a task's checklist. [Source: schema SQL.]

### TaskComment (`tbltask_comments`)

Table is `tbltask_comments` (not `tbltaskcomments`). Creator, assignees and followers can comment;
comments support file attachments. [help.perfexcrm.com create-new-task → Task Comments.]

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `content` | mediumtext | `String` | |
| `taskid` | int NOT NULL | `Int` | FK → Task. |
| `staffid` | int NOT NULL | `Int` | Author (staff). 0 if by contact. |
| `contact_id` | int NOT NULL default 0 | `Int @default(0)` | Author (customer contact), if any. |
| `file_id` | int NOT NULL default 0 | `Int @default(0)` | Optional attachment ref. |
| `dateadded` | datetime NOT NULL | `DateTime` | |

[Source: schema SQL.]

### Timesheet / task timer (`tbltaskstimers`)

The core time-tracking record: a start/stop timer per task per staff member. The project
"Timesheet" tab aggregates all timers of the project's tasks. Manual entries are allowed (pick
start time, end time, task, staff). [help.perfexcrm.com timesheets.]

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `task_id` | int NOT NULL | `Int` | FK → Task (note underscore here). |
| `start_time` | varchar(64) NOT NULL | `DateTime` | Stored as unix-timestamp string in Perfex; model as `DateTime`. |
| `end_time` | varchar(64) NULL | `DateTime?` | Null while timer running. |
| `staff_id` | int NOT NULL | `Int` | FK → staff/user. |
| `hourly_rate` | decimal(15,2) NOT NULL default 0 | `Decimal @default(0)` | Snapshot of task rate at log time (used for Task Hours billing). |
| `note` | mediumtext | `String?` | |

Logged duration = `end_time - start_time`. There is **no stored `logged_time`** on the task; it is
summed from timers. Billable vs non-billable is a property of the **task** (`tasks.billable`), not
the timer — all timers of a billable task are billable. [Sources: schema SQL; REST API timesheet
JSON `task_id/start_time/end_time/staff_id/hourly_rate/note`.]

### ProjectMember (`tblproject_members`)

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `staff_id` | int NOT NULL | `Int` | FK → staff/user. |

Only project members (and staff with global Projects View) can access a project. [help.perfexcrm.com
new-project; staff-permissions-explained.]

### ProjectFile (`tblproject_files`)

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `file_name` | varchar | `String` | Stored filename. |
| `original_file_name` | varchar | `String?` | **3.1.0 only.** |
| `subject` | varchar | `String?` | |
| `description` | text | `String?` | |
| `filetype` | varchar | `String?` | MIME. |
| `dateadded` | datetime | `DateTime` | |
| `last_activity` | datetime NULL | `DateTime?` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `visible_to_customer` | tinyint(1) | `Boolean @default(false)` | |
| `staffid` | int | `Int` | Uploader (staff). |
| `contact_id` | int default 0 | `Int @default(0)` | Uploader (contact) if from portal. |
| `external` | varchar NULL | `String?` | External provider (e.g. Google Drive). |
| `external_link` | text NULL | `String?` | |
| `thumbnail_link` | text NULL | `String?` | |

[Source: schema SQL.]

### ProjectDiscussion (`tblprojectdiscussions`)

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `subject` | varchar(191) | `String` | |
| `description` | text | `String?` | |
| `show_to_customer` | tinyint(1) | `Boolean @default(false)` | If on, contacts see it in the portal + get an email. |
| `datecreated` | datetime | `DateTime` | |
| `last_activity` | datetime NULL | `DateTime?` | |
| `staff_id` | int | `Int` | Author (staff). |
| `contact_id` | int | `Int @default(0)` | Author (contact) if started from portal. |

Discussion replies live in `tbldiscussion_comments` (discussion id, content, staff/contact author,
attachments, dateadded). Discussions are threaded comments scoped to a project. [help.perfexcrm.com
project-discussions; schema SQL.]

### ProjectNote (`tblproject_notes`)

Per-project free-text notes (distinct from the generic CRM `tblnotes`).

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `content` | mediumtext | `String` | |
| `staff_id` | int | `Int` | Author. |

Note: Perfex also has a generic `tblnotes` (`rel_id`,`rel_type`,`description`,`date_contacted`,
`addedfrom`,`dateadded`) used for lead/customer notes; the PM "Notes" tab uses `tblproject_notes`.
[Source: schema SQL.]

### ProjectActivity (`tblproject_activity`)

The per-project audit log shown on the Activity tab. Each entry can be toggled visible/hidden to
the customer.

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `staff_id` | int | `Int` | Actor (staff), 0 if system/contact. |
| `contact_id` | int | `Int @default(0)` | Actor (contact). |
| `fullname` | varchar | `String?` | Denormalised actor name. |
| `visible_to_customer` | tinyint(1) | `Boolean @default(false)` | |
| `description_key` | varchar | `String` | i18n key (e.g. `project_activity_created_task`). |
| `additional_data` | text | `String?` | Serialized params for the i18n string. |
| `dateadded` | datetime | `DateTime` | |

[help.perfexcrm.com project-activity; schema SQL.]

### ProjectSetting (`tblproject_settings`) — EAV, customer-visibility toggles

This is the table that holds all per-project customer-portal visibility toggles. It is an EAV
table (one row per project per key). Values are `'1'`/`'0'` strings, except `available_features`
which stores a serialized array of enabled tab slugs.

| Perfex column | Type | Prisma | Notes |
|---|---|---|---|
| `id` | int PK AI | `Int @id` | |
| `project_id` | int NOT NULL | `Int` | FK → Project. |
| `name` | varchar(100) NOT NULL | `String` | Setting key (see below). |
| `value` | mediumtext | `String` | `'1'`/`'0'` or serialized. |

**Canonical setting keys** (from `Projects_model` constructor):

```
available_features              # serialized list of enabled tabs
view_tasks                      # customer can view tasks
create_tasks                    # customer can create tasks
edit_tasks                      # customer can edit tasks
comment_on_tasks                # customer can comment on tasks
view_task_comments
view_task_attachments
view_task_checklist_items
upload_on_tasks                 # customer can upload attachments on tasks
view_task_total_logged_time
view_finance_overview           # hidden if billing_type = Fixed Cost
upload_files                    # customer can upload project files
open_discussions                # customer can open discussions
view_milestones
view_gantt
view_timesheets
view_activity_log
view_team_members
hide_tasks_on_main_tasks_table  # don't surface project tasks in the global task list
```

These map 1:1 to the toggles on the New/Edit Project screen. New projects default their settings
from the **last created project**. The sub-task toggles (comments/attachments/checklist/upload) are
ignored unless `view_tasks` is on. `view_finance_overview` is not shown for Fixed Cost projects.
[help.perfexcrm.com new-project; schema SQL + Projects_model.]

> **Recommended translation:** rather than an EAV table, model these as boolean columns on a
> `ProjectSettings` row (1:1 with Project) or a `Json` field. Prisma + Postgres handle typed
> columns far better than EAV, and the key set is fixed.

---

## Enums and statuses

All four enums are integer-coded in Perfex. Values verified from PHP class constants / language
files in source — **not** inferred from UI order (the UI deliberately displays them in a different
order via a separate `order` attribute).

### Task status (`tbltasks.status`)
From `Tasks_model` constants + `english_lang.php`:

| Int | Name | Core? | UI display order |
|---|---|---|---|
| 1 | Not Started | core | 1st |
| 2 | Awaiting Feedback | | 4th |
| 3 | Testing | | 3rd |
| 4 | In Progress | core | 2nd |
| 5 | Complete | core | last (order 100) |

So the integer order is `1,2,3,4,5` but the board/list shows `Not Started → In Progress (4) →
Testing (3) → Awaiting Feedback (2) → Complete (5)`. Marking a task complete sets `status=5` and
`datefinished=now`. Core statuses (1,4,5) drive logic and must exist; custom statuses can be added
in Perfex via a hook with ids ≥ 50 and a `filter_default` flag (excluded-from-default-list when
false). [help.perfexcrm.com add-new-task-status; Tasks_model.php.]

### Project status (`tblprojects.status`)
From `Projects_model::get_project_statuses()` + `english_lang.php`:

| Int | Name | Core? | Behaviour |
|---|---|---|---|
| 1 | Not Started | core | Initial state. |
| 2 | In Progress | | Active work. |
| 3 | On Hold | | Paused. |
| 4 | Finished | core | "Mark as finished" sets status=4 and stamps `date_finished`. |
| 5 | Cancelled | | Abandoned; UI lists it before Finished (order 4) but the integer is 5. |

No gap at 4 (a common misconception): 4=Finished, 5=Cancelled. Custom project statuses via hook,
ids ≥ 50, same `filter_default` semantics. [help.perfexcrm.com add-new-project-status;
Projects_model.php.]

### Task priority (`tbltasks.priority`)
From `tasks_helper::get_tasks_priorities()` + `english_lang.php`:

| Int | Name | Colour |
|---|---|---|
| 1 | Low | #777 |
| 2 | Medium | #03a9f4 |
| 3 | High | #ff6f00 |
| 4 | Urgent | #fc2d42 |

Nullable: a task may have no priority. [tasks_helper.php.]

### Project billing type (`tblprojects.billing_type`)
From the project view `<select>` + `english_lang.php`:

| Int | Name | Drives |
|---|---|---|
| 1 | Fixed Rate (Fixed Cost) | `project_cost` |
| 2 | Project Hours | `project_rate_per_hour` × total logged hours |
| 3 | Task Hours | Σ over tasks of (task `hourly_rate` × that task's logged hours) |

Billing type **cannot be changed** once any task on the project has been billed. [help.perfexcrm.com
new-project; Projects_model billing switch.]

### Related-entity type (`tbltasks.rel_type`)
String enum: `project`, `lead`, `customer`, `invoice`, `estimate`, `contract`, `ticket`, `expense`,
`proposal`, `internal` (and similar). For PM only `project` matters; the rest are CRM-adjacent and
out of scope.

---

## Computations

### Progress
- **Manual** (`progress_from_tasks = 0`): `progress` is an integer 0–100 set by hand on the project.
- **From tasks** (`progress_from_tasks = 1`, the default): `progress = round(completed_tasks /
  total_tasks * 100)` over the project's tasks, where "completed" = task `status = 5`. (Tasks with a
  future start date still count toward totals.) Milestone progress is the same ratio scoped to one
  milestone (`total_finished_tasks / total_tasks`), computed on the fly.

### Logged hours
- Per task: `Σ (end_time − start_time)` over its `tbltaskstimers` rows (running timers excluded
  until stopped).
- Per project: sum across all the project's tasks' timers.
- **Billable hours** = logged hours on tasks where `billable = 1`.
- **Billed hours** = logged hours on tasks where `billed = 1` (already invoiced).
- **Unbilled (billable not yet billed)** = billable − billed.

### Billable amount per billing type
From the Finance Overview doc (worked examples) and `Projects_model`:

- **Fixed Rate (1):** amount = `project_cost`. Flat; time tracked for info only. Finance overview's
  monetary total is not shown for Fixed Cost.
- **Project Hours (2):** amount = `project_rate_per_hour × total_billable_logged_hours`.
  Example: rate 40, logged 3h → 120.
- **Task Hours (3):** amount = `Σ over billable tasks (task.hourly_rate × that task's logged hours)`.
  Example: Task A rate 25 × 1h + Task B rate 40 × 2h = 105. Each billable task must have an
  `hourly_rate` set.

[help.perfexcrm.com finance-overview, invoicing-project.]

### Invoicing (CRM-adjacent, for context only)
When invoicing a project you choose an item layout: **Single Line** (one item = project, desc =
all tasks + logged time; N/A for Task Hours), **Task Per Item** (one item per billable task; N/A for
Fixed Cost), or **All timesheets individually** (one item per billable timesheet; N/A for Fixed
Cost). Billing a task sets it `billed=1`, marks it Complete, locks its timers, and stamps
`invoice_id`. Tasks with a future start date are unchecked by default. [help.perfexcrm.com
invoicing-project.] *For Story Advantage this maps to the finance/P&L layer, not the PM core.*

---

## Feature checklist

Grouped Must / Should / Could for a faithful PM clone of Perfex (PM scope only; CRM billing left
to the existing finance layer).

### Must
- Project CRUD with: name, customer link, billing type, status, start date, deadline, description,
  cost/rate/estimated-hours, manual-vs-from-tasks progress, project members.
- Project statuses (Not Started / In Progress / On Hold / Finished / Cancelled) with "mark finished"
  stamping `date_finished`.
- Three billing types with the progress + amount formulas above (or our equivalent finance layer).
- Milestones: name, due date, description, colour, order, project link; tasks attach via FK.
- Tasks: subject, description, priority (Low/Med/High/Urgent), status (the 5-status set), start/due
  dates, hourly rate, billable flag, milestone link, `rel_type`/`rel_id`, multiple assignees.
- Task timers / timesheets: start/stop + manual entry, per staff, with rate snapshot; project
  timesheet aggregation; billable vs non-billable.
- Task checklist items (ordered, tickable) and task comments.
- Followers (incl. non-members), task attachments.
- Project tabs: Overview, Tasks, Timesheet, Milestones, Files, Discussions, Gantt, Activity.
- Per-project customer-visibility settings (the `tblproject_settings` key set).
- Roles/permissions: Projects & Tasks View(Global/Own)/Create/Edit/Delete, project-member scoping.
- Project activity log with per-entry customer visibility.

### Should
- Task Kanban (status columns) with `kanban_order`, and milestone Kanban with drag-and-drop between
  milestones (`milestone`/`milestone_order` only).
- Gantt chart per project (tasks + milestones; colour by state: not-started/in-progress blue,
  overdue red, finished green).
- Recurring tasks (`recurring`, `repeat_every`, `recurring_type`, cycles).
- **Copy project** (with option to copy milestones) and **copy task** (with assignees, followers,
  attachments, checklist) — Perfex's only native "templating".
- Project discussions with portal visibility + email notifications.
- Project notes (sticky per-project notes).
- Tags on tasks; pinning projects.
- Custom task/project statuses with `filter_default`.
- "Allow all staff to see all tasks related to projects" global toggle.

### Could
- Per-task client visibility (`visible_to_client`) independent of project settings.
- Finance overview panel (logged/billable/billed/unbilled hours + amount).
- External file links (Google Drive style) on project files.
- Deadline reminder notifications (`deadline_notified`).
- Custom fields on projects/tasks (Perfex has a generic custom-fields engine).

---

## Customer integration

In Perfex a project binds to a **customer** via `tblprojects.clientid` (FK to `tblclients`).
Contacts belong to the customer (`tblcontacts.userid = client id`); a project does not link to a
single contact, it links to the company, and notifications fan out to the customer's contacts that
have the "projects" portal permission. Project currency defaults to base currency, or the customer's
currency if the customer overrides it. [help.perfexcrm.com new-project, project-discussions.]

What customer data the PM screens show: customer name (project header), the customer's contacts (for
notifications and as discussion/file/comment authors when they act via the portal), and the
customer's currency (for finance). The portal shows a project's tabs **filtered by**
`tblproject_settings` toggles, per project.

**Customer-portal visibility is per tab, per project** — driven entirely by the
`tblproject_settings` keys (`view_tasks`, `view_milestones`, `view_gantt`, `view_timesheets`,
`view_finance_overview`, `open_discussions`, `upload_files`, `view_activity_log`,
`view_team_members`, and the task sub-toggles). The `available_features` key further controls which
tabs exist for that project at all.

### Binding to a GHL-synced customer (Story Advantage)
- Replace `clientid` with a FK to our **Customer** model. Our Customer should carry the GHL contact/
  opportunity ids (e.g. `ghlContactId`, `ghlOpportunityId`) and be the single record GHL syncs into;
  the project references it. Keep `clientid`-equivalent as `customerId Int` / relation.
- Perfex's "contacts" become our customer-side users/recipients; map GHL contacts onto them so
  Slack/n8n notifications and any portal visibility resolve through the GHL-synced customer rather
  than a Perfex `tblcontacts` table.
- Currency/finance: defer to our `lib/finance.ts`; do not import Perfex's invoice tables. The project
  → customer link is the only hard PM dependency on the CRM side.
- Visibility toggles: keep the concept (a `ProjectSettings` 1:1 with typed booleans) but gate them
  through our roles (`isApprover`/`isAdmin`) and BRS rules; the customer-portal surface is a later
  concern and should not leak BRS gate internals.

> Important divergence: in Story Advantage the BRS **gates** (copy locked before design/build,
> options before commitment, grunt test, element-by-element approval) are a separate state machine
> (`lib/gates.ts`) and must **not** be conflated with Perfex task/project `status`. Likewise our
> planning lanes/sprints set `planningLane`/`sprintId` only and never the gate status. Perfex's task
> `status` is closest to our planning/tracker state, not to a BRS gate.

---

## Templates

### What Perfex does natively
Perfex has **no first-class "project template" or "task template" entity**. Its reuse mechanisms are:

1. **Copy Project** — duplicates a project; a checkbox lets you also copy its **milestones** (and,
   depending on version, tasks/members/settings). This is the primary "template a process" workflow.
   [perfexcrm.com documentation/projects: "Great copy feature… Ability to copy the milestones."]
2. **Copy Task** — duplicates a task with optional copy of **assignees, followers, attachments and
   checklist items** (each shown as a checkbox). [help.perfexcrm.com copy-task.]
3. **Checklist templates** (`tbltasks_checklist_templates`) — a small library of reusable checklist
   line items you can insert into any task's checklist. This is the only stored "template" table in
   PM.
4. **Recurring tasks** — not a template per se, but auto-recreates a task on a schedule.

Third-party modules on CodeCanyon add real templating (e.g. "project templates", "predefined task
lists", "task templates", and richer status modules like the "Add-on Statuses" module). They
typically add: a `templates` table of saved project skeletons (milestones + tasks + default
assignees/checklists), and a "create project from template" action that seeds those rows. We do not
need to adopt any specific module, but they confirm the shape: a template is a detached tree of
milestones → tasks → checklist items with defaults, instantiated by a copy/seed routine. [CodeCanyon
listing: Third Party Modules / modules collection.]

### Proposed model for Story Advantage (sprint / process / unstructured templates)
We need three template flavours. Suggested Prisma shape (names indicative; align with existing
`lib/brs-template.ts` / `lib/seed-funnel.ts` conventions):

- **ProjectTemplate** — `id`, `name`, `kind` (`PROCESS` | `SPRINT` | `UNSTRUCTURED`), `description`,
  `defaultBillingType?`, `isActive`, ordering. The detached skeleton that "create project from
  template" instantiates.
- **TemplateMilestone** — `id`, `templateId`, `name`, `description?`, `color?`, `order`,
  `dueOffsetDays?` (relative to project start, since templates have no absolute dates). For SPRINT
  templates a milestone ≈ a sprint definition (`durationDays`, `sprintIndex`).
- **TemplateTask** — `id`, `templateId`, `templateMilestoneId?`, `name`, `description?`, `priority?`,
  `billable`, `hourlyRate?`, `estimatedHours?`, `startOffsetDays?`, `dueOffsetDays?`,
  `defaultAssigneeRole?`, `order`. Carries any BRS metadata (which gate/step it belongs to) so the
  gate state machine can attach on instantiation — but the template stores **defaults only**, never
  live gate status.
- **TemplateChecklistItem** — `id`, `templateTaskId`, `description`, `order`. (Mirrors
  `tbltasks_checklist_templates` but scoped to a template task.)

Instantiation (`createProjectFromTemplate`): create Project (+ ProjectSettings) → for each
TemplateMilestone create a Milestone (resolve `dueOffsetDays` against `start_date`; for SPRINT kind
also create the per-build Sprint via `lib/sprints.ts`) → for each TemplateTask create a Task linked
to the milestone/sprint, resolving offsets to dates, applying default assignees, copying checklist
items, and setting initial planning lane — **without** touching the BRS gate `status`, which is
initialised by `lib/gates.ts`/`lib/seed-funnel.ts` per the BRS rules.

Template kinds:
- **PROCESS** ("typical-process template") — the faithful Perfex "copy project" analogue: a fixed
  milestone+task tree (e.g. the standard DFY build), instantiated whole.
- **SPRINT** ("sprint template") — milestones map to sprints; tasks seed each sprint's backlog;
  drives the planning board lanes.
- **UNSTRUCTURED** — a near-empty template (project + settings, no milestones/tasks) for ad-hoc
  projects; users add tasks freely, matching Perfex's "just create tasks under a project" mode.

This gives us Perfex-equivalent copy/duplicate behaviour plus the structured, reusable templates
Perfex lacks, while keeping templates strictly as **defaults** that the gate/sprint layers own at
runtime.

---

## Roles / permissions relevant to projects

Perfex uses staff **roles** (a permission set) overridable per staff member. Each feature has up to
five flags: **View (Global)**, **View (Own)**, **Create**, **Edit**, **Delete**. For PM:

**Projects**
- View (Global): all projects.
- View (Own): N/A as a flag — instead, without View(Global) a staff member sees only projects where
  they are a **project member**.
- Create: create projects.
- Edit: all (with View Global) plus projects where they are a member.
- Delete: all (with View Global) plus own.

**Tasks**
- View (Global): all tasks.
- View (Own): without View(Global), sees only tasks where they are **assignee, follower, or the task
  is public**.
- Create / Edit / Delete: all (with View Global) plus tasks they are connected to.
- Global setting **"Allow all staff to see all tasks related to projects"** (Setup→Settings→Tasks):
  when ON, a project member can see *all* the project's tasks even without Tasks View(Global).

Timesheet staff selection is permission-gated: a user without Projects Edit/Create can only log time
as themselves. [help.perfexcrm.com staff-permissions-explained, timesheets, disallow-project-members-
to-see-all-project-tasks.]

### Mapping to Story Advantage roles
Perfex's per-feature CRUD flags do **not** map cleanly to our model — we use `SUPER_ADMIN`
(Marlon, sole approver + only one who can permanently delete), `ADMIN` (also approver), and the
`isApprover`/`isAdmin` helpers in `lib/auth-helpers.ts` as the single source of truth (never compare
to the literal `"ADMIN"`). Recommended bindings:
- "Project member" → our membership model (a user attached to a build/engagement); non-members get
  Perfex's restricted visibility by default.
- Approver-only actions (Perfex would gate via Edit/Delete) → route through `isApprover`/`isAdmin`,
  and remember the AI layer is advisory only (never clears a gate, approves, selects an option, or
  edits content).
- Permanent delete/purge/restore → `SUPER_ADMIN` via `/trash` + `lib/soft-delete.ts`; Perfex's hard
  delete becomes our soft delete + audited purge.

---

## Sources

- Perfex — New Project (fields, billing types, project settings/visibility toggles):
  https://help.perfexcrm.com/new-project/
- Perfex — Create New Task (task fields, priorities, recurring, comments, assignees/followers):
  https://help.perfexcrm.com/create-new-task/
- Perfex — Add New Task Status (5 statuses, core statuses, custom-status hook, filter_default):
  https://help.perfexcrm.com/add-new-task-status/
- Perfex — Add New Project Status (5 project statuses, core statuses):
  https://help.perfexcrm.com/add-new-project-status/
- Perfex — Copy Task (copy assignees/followers/attachments/checklist):
  https://help.perfexcrm.com/copy-task/
- Perfex — Timesheets (timer model, manual entry, staff/task link, permission gating):
  https://help.perfexcrm.com/timesheets/
- Perfex — Finance Overview (logged/billable/billed/unbilled; per-type amount formulas):
  https://help.perfexcrm.com/finance-overview/
- Perfex — Invoicing Project (item layouts, bill-tasks behaviour, billing locks):
  https://www.perfexcrm.com/documentation/projects/invoicing-project/
- Perfex — Project Discussions (subject/description/visible-to-customer):
  https://help.perfexcrm.com/project-discussions/
- Perfex — Project Activity (per-entry customer visibility):
  https://help.perfexcrm.com/project-activity/
- Perfex — Projects category index (tab overview, copy feature, milestones):
  https://help.perfexcrm.com/category/projects/ and https://www.perfexcrm.com/documentation/projects/
- Perfex — Staff Permissions Explained (Projects/Tasks View/Create/Edit/Delete, member scoping):
  https://help.perfexcrm.com/staff-permissions-explained/
- CodeCanyon — Perfex listing (feature list: Gantt per project/staff, milestones drag-and-drop,
  copy project incl. milestones, multiple assignees, followers non-members, recurring tasks,
  activity log, roles & permissions, CodeIgniter/MySQL/SQL):
  https://codecanyon.net/item/perfex-powerful-open-source-crm/14013737
- Themesic — REST API for Perfex (authoritative JSON field names for projects, tasks, milestones,
  timesheets; confirms billing_type/progress_from_tasks/rel_type/milestone_order etc.):
  https://perfexcrm.themesic.com/apiguide/
- Perfex source — canonical SQL schema (exact columns, all `tbl*` PM tables):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/install/database.sql and
  https://github.com/vikaas127/DOT-ONE/blob/main/modules/perfex_saas/migrations/default_seeds/database-3.1.0.sql
- Perfex source — `Tasks_model.php` (task status class constants STATUS_NOT_STARTED=1 …
  STATUS_COMPLETE=5; get_statuses ordering):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/application/models/Tasks_model.php
- Perfex source — `Projects_model.php` (get_project_statuses, billing-type switch, project_settings
  key list):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/application/models/Projects_model.php
- Perfex source — `tasks_helper.php` (priority 1 Low / 2 Medium / 3 High / 4 Urgent + colours):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/application/helpers/tasks_helper.php
- Perfex source — `english_lang.php` (status/priority/billing display names):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/application/language/english/english_lang.php
- Perfex source — `views/admin/projects/project.php` (billing_type integer→label select):
  https://github.com/crypto-demigod/Perfex-CRM/blob/master/application/views/admin/projects/project.php
- Perfex — Version 1.2.0 release notes (Gantt shows tasks + milestones; colour states):
  https://www.perfexcrm.com/2016/08/19/version-1-2-0-released/
