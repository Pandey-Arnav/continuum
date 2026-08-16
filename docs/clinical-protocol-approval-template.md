# Clinical protocol approval record

Create one signed copy per `protocol_versions.id`. Never approve a protocol by
editing only the database status.

## Identity and intended use

- Protocol ID and version:
- Owner and backup owner:
- Jurisdiction, site, and population:
- Intended users and workflow:
- Intended use:
- Explicitly excluded uses:
- Effective date and review due date:

## Source review

- Primary source title, publisher, version/date, and stable URI:
- Local policy/guideline dependencies:
- Terminology and unit conventions:
- Evidence-quality or applicability limitations:
- Change since previous version:

## Rule-by-rule review

For every rule, record category, threshold/condition, expected flag, reason
text, evidence source, local adaptation, edge cases, contraindications, test
IDs, reviewer decision, and reviewer initials/date.

## Workflow safety

- Who receives green, amber, and red items?
- Maximum expected acknowledgement time for red items:
- What happens outside service hours?
- What local emergency wording is approved?
- What does the user do when evidence is missing or contradictory?
- Is the tool advisory, shadow-mode, or used in a live workflow?

## Approval

- Clinical reviewer name, credentials, organization, signature/date:
- Second reviewer or governance committee, decision/date:
- Product owner acceptance of limitations, signature/date:
- Conditions of approval:
- Monitoring and withdrawal criteria:

Only after signed evidence exists should a privileged administrator set
`status = 'clinically_approved'`, `source_uri`, `approved_by`, `approved_at`,
and the next review date.
