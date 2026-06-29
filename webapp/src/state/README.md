# Redux state

This folder holds the plugin's own Redux store (mounted under
`plugins-${pluginId}`). It's split into one self-contained redux **slice** per concern.

> Work in progress and will be refactored as we go.

## Folder structure

Each slice lives in its own folder:
  1. `slice/action_types.ts`
  2. `slice/actions.ts`
  3. `slice/reducer.ts`
  4. `slice/selectors.ts`

## Action types

1. Action types are constants that represent **events that already happened**, not commands or setters. They are named using the past tense of the verb in UPPER_SNAKE_CASE eg `USER_JOINED`, `USER_MUTED` etc.
1. Action types used by more than one slice stay in the root in `common_action_types.ts`.

## Actions

1. Actions (action creators) are functions that return an action object — a `type` (one of the action types above) plus its `data` — for the reducer to handle.
1. Similar to Action types, convention for naming them is also past tense verbs but in camelCase eg. `userJoined`, `userMuted` etc.
1. Each slice exports a union of its action types named `Actions` from its `actions.ts`, used to type the reducer (`Reducer<State, Actions>`).
1. Actions used by more than one slice stay in the root in `common_actions.ts`.
1. It is highly recommended to write tests for actions.
1. When writing tests for actions test the logic, not the shape. Spend the effort on testing actions with real behavior: defaulting and async/thunk actions where the request URL, method, payload, guard clauses, and error handling all matter.

## Reducers

1. Reducers are pure: derive the next state only from the current state and the
  action. No side effects, no reading other slices.
1. Read state through selectors rather than reaching into the store shape directly, so slice internals can change without breaking call sites.
1. It is highly recommended to write tests for reducers.
1. When writing tests for reducers test the highest-value tests in a slice. Cover every action type plus the edge branches: no-op cases that return the *same state reference, immutability, and any object-reuse optimizations. Drive the reducer through the real action creators or actions rather than hand-writing action objects with hardcoded `type` strings — this exercises the action + reducer together and survives renames.

## Selectors

1. Selectors read from the slice's state and derive the values components need; shared ones live in the root `common_selectors.ts`.
1. It is highly recommended to write tests for selectors.
1. When writing tests for selectors test the derivation logic, especially memoized selectors and any defaulting/fallback behavior.

## Testing conventions

1. Colocate tests next to the source as `*.test.ts` (e.g. `reducer.test.ts`, `actions.test.ts`, `selectors.test.ts`).
1. Use `test(...)`, not `it(...)`.
1. Try to keep a flat `describe` structure — one `describe` per function under test, with no nested `describe` blocks. In `actions.ts`/`selectors.ts` that means one `describe` per exported function (e.g. `describe('userScreenShared', ...)`). A reducer is a single function, so it gets one `describe` with each case named after its action type (e.g. `test('USER_LEFT clears the channel when the sharer leaves', ...)`).
