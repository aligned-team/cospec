# Add greeting capability

## Why

The sample service has no way to greet a user by name. Product wants a friendly
greeting endpoint so onboarding flows can address people directly.

## What Changes

- Add a `greeting` capability that returns a personalized message.
- Expose it through the existing HTTP layer.

## Impact

- New capability `greeting`; no breaking changes to existing endpoints.
