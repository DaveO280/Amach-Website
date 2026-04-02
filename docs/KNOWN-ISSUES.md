# Known Issues

## Privy React Error: `isActive` Prop on DOM Element

### Issue

When using Privy's signature modal (e.g., during wallet encryption key derivation), React throws an error:

```
React does not recognize the `isActive` prop on a DOM element.
```

### Root Cause

This is a known issue with Privy's internal styled-components. The `isActive` prop is passed to DOM elements, which React doesn't recognize. This occurs when:

1. A signature request is made (e.g., `privySignMessage`)
2. Privy's signature modal opens
3. The modal opening causes a re-render that changes the component tree structure, triggering hook order issues

### Impact

- **Severity**: Low (does not break functionality)
- **Frequency**: Occurs when signature modals appear (wallet setup, profile decryption, etc.)
- **User Impact**: Console errors/warnings only — the app continues to function

### Workarounds Applied

1. **Deferred signature requests**: Wrapped in `setTimeout` to defer to the next event loop tick
2. **Stable component structure**: `PrivyProvider` always renders `PrivyProviderBase` with the same structure
3. **Memoized config**: Privy configuration is memoized to prevent re-initialization

### Long-term Solution

This should be reported to Privy. Potential fixes on their end:

- Use transient props (`$isActive`) in styled-components
- Filter out non-DOM props using `shouldForwardProp`

### References

- Privy GitHub: https://github.com/privy-io/privy
- Privy Docs: https://docs.privy.io
