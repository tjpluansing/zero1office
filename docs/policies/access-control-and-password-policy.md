# Ask Karla: Access Control and Password Policy

**Version:** 1.0 · **Effective:** on go-live of zero1office · **Owner:** Paolo (IT) · **Approved by:** Karla (CEO & Founder) · **Filed with:** the Data Protection Officer

This policy covers zero1office and every system that holds client personal data (Microsoft 365, GoHighLevel, the company OneDrive). It is written to meet Sections 11, 13, 15, 19 and 29 of NPC Circular 2023-06 (Security of Personal Data) under the Data Privacy Act of 2012.

## 1. Principles

- **Need to know.** People get only the pages and actions their current job needs. Nothing is shared "just in case".
- **One person, one account.** No shared logins. Every action is tied to a named person in the audit log.
- **The system enforces it.** Permissions are checked by the database on every request, not only hidden from menus.

## 2. Roles

| Role | Who | Access |
|---|---|---|
| Super Admin | Paolo (IT), Karla (CEO) | Everything, including users, settings and the audit log. At least two people, always. |
| Agent | Licensed agents | Clients, quotes, billing and reports, including approvals and exports. No user management. |
| Assistant | Assistants, OJT | Follow up pending items: add and update clients, draft quotes, see billing status. No reports, deletes, exports, approvals or admin unless granted for a reason. |
| No access | New Microsoft sign-ins | Nothing until a Super Admin approves them. |

Any change from a preset is made in Manage Users, is shown as "custom", and is recorded in the audit log. The reason should be noted in the next access review.

## 3. Granting, changing and removing access

1. **Joiners.** A Super Admin adds the person in Manage Users with the narrowest suitable role. Before any access opens, the person must set their own password and accept the Acceptable Use and Privacy Agreement (shown on first sign-in; acceptance is recorded).
2. **Changes.** Requests come from Karla or the person's lead, in writing (email or Teams). The admin who makes the change cannot change their own access.
3. **Leavers and long absences.** Suspend the account on the last working day, before handing over equipment. Delete only after records are handed over. Suspend accounts unused for 60 days.
4. **Temporary access** (OJT, cover during leave) is granted for a stated end date and removed on that date.

## 4. Passwords

- At least **12 characters**, letters and at least one number. Passphrases are encouraged.
- Not the same as, or based on, any other password; not containing your name, email or "askkarla".
- Stored only in the company password manager (Bitwarden). Never written down, emailed or sent in chat.
- Temporary passwords given by an admin must be changed at first sign-in (the system forces this).
- Change immediately if you think anyone else knows it, and tell Paolo.
- Repeated failed sign-ins are rate-limited by the sign-in service.

## 5. Two-step verification

- **Required** for anyone with user administration, settings, or export permissions. Those features stay locked until the person's session is verified with a code from an authenticator app (Microsoft Authenticator recommended).
- Recommended for everyone else.
- Lost phone: another Super Admin resets two-step verification from Manage Users after confirming the person's identity by phone or video call.

## 6. Sessions

- Automatic sign-out after **30 minutes** of inactivity.
- Lock your screen whenever you leave your device (Windows + L / Ctrl + Cmd + Q).
- Do not sign in on shared or public computers.

## 7. Emergency (break-glass) access

One Super Admin login, separate from personal accounts, exists for when both Super Admins are unavailable or Microsoft sign-in is down. Its password and two-step recovery codes are kept in a Bitwarden vault item shared only with Paolo and Karla. Any use is reported to both within 24 hours, and the password is changed afterwards.

## 8. Monitoring and review

- The audit log records sign-ins, user and permission changes, password and two-step resets, agreement acceptance and every export.
- **Monthly access review:** a Super Admin opens Access Review, checks every account (flags: no sign-in for 30+ days, admin or export without two-step, custom permissions, pending approvals), fixes anything unneeded, and signs off. Each review stores a snapshot of everyone's access.
- Security logs are kept for at least **one year**, longer if related to an incident.

## 9. Incidents

Suspected misuse, a lost device, or data sent to the wrong person is reported to Paolo and the DPO **within 24 hours**. They assess whether it is a personal data breach that must be reported to the NPC and affected clients within the NPC's deadline.

## 10. Review of this policy

Reviewed every year, after any incident, or when roles or systems change. Changes to the Acceptable Use and Privacy Agreement are published as a new version in zero1office, and everyone must accept it again before continuing.

---

**Acknowledged by**

Paolo, IT ___________________ Date ________

Karla, CEO & Founder ___________________ Date ________

Data Protection Officer ___________________ Date ________
