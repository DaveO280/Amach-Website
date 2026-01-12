# Known Issues

## Privy React Error: `isActive` Prop on DOM Element

### Issue

When using Privy's signature modal (e.g., during wallet encryption key derivation), React throws an error:

```
React does not recognize the `isActive` prop on a DOM element.
```

This is accompanied by:

```
Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
```

### Root Cause

This is a known issue with Privy's internal styled-components. Privy's components pass an `isActive` prop to DOM elements, which React doesn't recognize. The error occurs when:

1. A signature request is made (e.g., `privySignMessage`)
2. Privy's signature modal opens
3. Privy's internal styled-components re-render
4. The `isActive` prop is passed to a DOM element, triggering the React warning
5. The modal opening causes a re-render that changes the component tree structure, causing hook order issues

### Impact

- **Severity**: Low (does not break functionality)
- **Frequency**: Occurs when signature modals appear (wallet setup, profile decryption, etc.)
- **User Impact**: Console errors/warnings, but the app continues to function

### Workarounds Applied

1. **Deferred signature requests**: Signature requests are wrapped in `setTimeout` to defer them to the next event loop tick, preventing them from occurring during React render cycles.

2. **Stable component structure**: `PrivyProvider` always renders `PrivyProviderBase` with the same structure to maintain hook order consistency.

3. **Memoized config**: Privy configuration is memoized to prevent re-initialization when modals appear.

### Long-term Solution

This issue should be reported to Privy. Potential fixes on their end:

- Use transient props (`$isActive`) in styled-components
- Filter out non-DOM props using `shouldForwardProp`
- Fix conditional rendering that causes hook order issues

### References

- Privy GitHub: https://github.com/privy-io/privy
- Privy Docs: https://docs.privy.io
- React Error #300: https://react.dev/reference/rules/rules-of-hooks
