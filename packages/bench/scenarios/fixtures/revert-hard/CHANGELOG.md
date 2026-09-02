# Changelog

## Unreleased

A "hype rebrand" pass shouted up every user-facing message in this package.
Users have complained; all three need reverting to their documented v1.0.0
behavior:

- `greet()` in src/greet.ts now uppercases the name and ends with `!!!`.
- `formatDisplayName()` in src/format.ts now uppercases both names and adds a
  trailing `!`.
- `formatPrice()` in src/currency.ts now appends a trailing `!!`.

## v1.0.0

- `greet(name)` returns `Hello, ${name}!` (e.g. `greet('Ada')` returns
  `'Hello, Ada!'`).
- `formatDisplayName(first, last)` returns `${first} ${last}` verbatim (e.g.
  `formatDisplayName('Jane', 'Doe')` returns `'Jane Doe'`).
- `formatPrice(cents)` returns a plain dollar string with no trailing
  punctuation (e.g. `formatPrice(1234)` returns `'$12.34'`).
