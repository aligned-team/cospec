# Spec Delta

## ADDED Requirements

### Requirement: Feedback follows the bug form

`cospec feedback` SHALL compose its issue body under cospec's bug-form headings,
naming any missing reproduction steps. Its manual-submission link SHALL open the
bug form with message, cospec version, wrapped OpenSpec version, and environment
prefilled.

#### Scenario: No gh available

- **WHEN** `gh` is missing and a user runs `cospec feedback "crash on view"`
- **THEN** the printed URL opens the bug form with every field prefilled
