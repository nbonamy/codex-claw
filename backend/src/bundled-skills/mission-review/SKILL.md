---
name: mission-review
description: Review Mission implementation evidence and repository changes before delivery.
---

# Review a Mission

Assess the completed implementation against the accepted Mission artifacts.

1. Read the accepted requirements, tickets, implementation evidence, and repository instructions.
2. Inspect the actual changes in every affected Mission worktree and run checks needed to validate material claims.
3. Report every actionable issue immediately with `{{mcpServerName}}.report-mission-review-finding`. Include its priority, exact represented repository path, and file/line when available. Do not hide actionable findings in prose.
4. Write the review artifact with `{{mcpServerName}}.write-mission-artifact`, then submit the delivery recommendation through `{{mcpServerName}}.submit-mission-result`.
5. If the user later starts remediation, fix only the selected findings and mark each verified fix with `{{mcpServerName}}.update-mission-review-finding`, including concise evidence.

The review is done when every affected repository is accounted for and the user has enough evidence to approve fixes or continue to Ship.
