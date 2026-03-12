# Test Documentation

## Overview

The `@page-speed/video` component has a comprehensive test suite with **129 passing tests** covering all critical functionality. The tests are organized by component and utility, ensuring reliability and preventing regressions.

## Test Framework

- **Test Runner**: Vitest 3.2.4
- **Testing Library**: @testing-library/react 16.3.2
- **DOM Environment**: happy-dom 15.11.7
- **Additional Matchers**: @testing-library/jest-dom 6.9.1

## Test Structure

### Test Files

```
src/__tests__/
├── setup.ts                        # Test configuration and global mocks
├── Video.test.tsx                  # Video component tests (19 tests)
├── VideoDefaults.test.tsx          # VideoDefaults component tests (9 tests)
├── getHlsMasterPlaylist.test.ts    # Transform API client tests (16 tests)
├── useHls.test.ts                  # HLS hook tests (12 tests)
├── shouldUseMp4Fallback.test.ts    # Fallback logic tests (26 tests)
├── pollForReadiness.test.ts        # Polling strategy tests (17 tests)
├── getOptimizedPosterUrl.test.ts   # Poster optimization tests (13 tests)
└── smoke.test.tsx                  # Integration smoke tests (17 tests)
```

## Test Coverage

### Video Component (19 tests)

**Basic Rendering (7 tests)**
- ✅ Renders video element with src
- ✅ Returns null when no src or masterPlaylistUrl
- ✅ Renders with masterPlaylistUrl
- ✅ Passes through native video props
- ✅ Applies poster attribute
- ✅ Applies custom className and style
- ✅ Renders with data attributes

**Controls (2 tests)**
- ✅ Enables controls by default when preferNativeControls is true
- ✅ Respects explicit controls prop over preferNativeControls

**Ref Forwarding (2 tests)**
- ✅ Forwards ref to video element
- ✅ Handles callback ref

**Fallback Source (1 test)**
- ✅ Renders source element with fallbackSrc when HLS fails

**Children (1 test)**
- ✅ Renders children (track elements, etc.)

**Debug Mode (1 test)**
- ✅ Does not throw errors when debug is enabled

**State Callbacks (1 test)**
- ✅ Accepts onPlaybackStateChange callback

**Transform Options (2 tests)**
- ✅ Accepts custom transformBaseUrl
- ✅ Accepts custom cdnBaseUrl

**Processing Strategies (2 tests)**
- ✅ Accepts optimistic processing strategy
- ✅ Accepts poll processing strategy

**Memoization (1 test)**
- ✅ Component is properly memoized

### VideoDefaults Component (9 tests)

- ✅ Renders children
- ✅ Sets default OptixFlow API key
- ✅ Cleanups default config on unmount
- ✅ Wraps multiple Video components
- ✅ Allows Video to override default with explicit prop
- ✅ Updates when optixFlowApiKey prop changes
- ✅ setDefaultOptixFlowApiKey sets default API key
- ✅ setDefaultOptixFlowApiKey clears when passed null
- ✅ setDefaultOptixFlowApiKey clears when passed undefined

### Transform API Client (16 tests)

**Provided Master Playlist URL (2 tests)**
- ✅ Returns provided masterPlaylistUrl without API call
- ✅ Logs when debug is enabled

**Source URL Validation (3 tests)**
- ✅ Returns error when src is empty
- ✅ Returns error when src is only whitespace
- ✅ Returns error when src is not a string

**Transform API Success (4 tests)**
- ✅ Fetches master playlist URL from transform API
- ✅ Uses custom transformBaseUrl
- ✅ URL-encodes the src parameter
- ✅ Logs debug information when debug is true

**Transform API Errors (7 tests)**
- ✅ Handles HTTP error status
- ✅ Handles error response with error flag
- ✅ Handles error response without message
- ✅ Handles missing master_playlist_url in response
- ✅ Handles fetch network error
- ✅ Handles non-Error exceptions
- ✅ Handles JSON parse error

### HLS Hook (12 tests)

**Initialization (3 tests)**
- ✅ Starts in idle state
- ✅ Remains idle when no masterPlaylistUrl provided
- ✅ Remains idle when no videoRef.current

**Native HLS Support (2 tests)**
- ✅ Uses native HLS when canPlayType supports it
- ✅ Logs debug info when using native HLS

**State Callbacks (2 tests)**
- ✅ Calls onStateChange when state changes
- ✅ Does not call onStateChange when not provided

**Error Handling (2 tests)**
- ✅ Handles unsupported HLS
- ✅ Logs warning when HLS not supported in debug mode

**Cleanup (1 test)**
- ✅ Does not call destroy on native HLS

**URL Changes (2 tests)**
- ✅ Updates when masterPlaylistUrl changes
- ✅ Returns to idle when masterPlaylistUrl becomes null

### MP4 Fallback Logic (26 tests)

**Error State (4 tests)**
- ✅ Returns true when HLS state is error and fallbackSrc exists
- ✅ Returns false when HLS state is error but no fallbackSrc
- ✅ Returns false when HLS state is error but fallbackSrc is empty
- ✅ Returns false when HLS state is error but fallbackSrc is whitespace

**Non-Error States (3 tests)**
- ✅ Returns false when HLS state is idle
- ✅ Returns false when HLS state is loading
- ✅ Returns false when HLS state is ready

**Edge Cases (3 tests)**
- ✅ Handles invalid fallbackSrc types gracefully
- ✅ Handles numeric fallbackSrc
- ✅ Handles object fallbackSrc

**All State Combinations (16 tests)**
- ✅ Tests all combinations of PlaybackState and fallbackSrc values

### Polling Strategy (17 tests)

**Successful Polling (3 tests)**
- ✅ Returns true when playlist is immediately ready
- ✅ Retries and succeeds after a few attempts
- ✅ Logs debug information when debug is true

**Failed Polling (4 tests)**
- ✅ Returns false when max attempts reached
- ✅ Logs warning when max attempts reached with debug
- ✅ Handles fetch errors gracefully
- ✅ Logs fetch errors in debug mode

**Configuration Options (4 tests)**
- ✅ Respects custom maxAttempts
- ✅ Respects custom intervalMs
- ✅ Uses default maxAttempts of 30
- ✅ Uses default intervalMs of 2000

**Response Status Codes (4 tests)**
- ✅ Continues polling on 404
- ✅ Continues polling on 500
- ✅ Succeeds on 200
- ✅ Succeeds on 304 (Not Modified)

**Edge Cases (2 tests)**
- ✅ Handles empty URL
- ✅ Does not wait after last attempt

### Poster Optimization (13 tests)

**Basic Functionality (3 tests)**
- ✅ Returns the original URL
- ✅ Returns URL without API key
- ✅ Returns URL with API key (passthrough for now)

**Debug Logging (3 tests)**
- ✅ Logs when API key is provided with debug enabled
- ✅ Does not log when API key is not provided
- ✅ Does not log when debug is disabled

**URL Formats (6 tests)**
- ✅ Handles absolute URLs
- ✅ Handles URLs with query parameters
- ✅ Handles URLs with hash fragments
- ✅ Handles data URLs
- ✅ Handles relative URLs
- ✅ Handles empty string

**Future Optimization Readiness (1 test)**
- ✅ Ready to implement OptixFlow integration

### Smoke Tests (17 tests)

**Module Exports (8 tests)**
- ✅ Exports Video component
- ✅ Exports VideoDefaults component
- ✅ Exports setDefaultOptixFlowApiKey function
- ✅ Exports getHlsMasterPlaylist function
- ✅ Exports useHls hook
- ✅ Exports shouldUseMp4Fallback function
- ✅ Exports pollForReadiness function
- ✅ Exports getOptimizedPosterUrl function

**Component Rendering (3 tests)**
- ✅ Renders Video component without errors
- ✅ Renders VideoDefaults component without errors
- ✅ Renders nested Video components without errors

**Function Calls (3 tests)**
- ✅ Calls setDefaultOptixFlowApiKey without errors
- ✅ Calls getOptimizedPosterUrl without errors
- ✅ Calls shouldUseMp4Fallback without errors

**Type Safety (2 tests)**
- ✅ Accepts valid Video props
- ✅ Accepts valid PlaybackState values

**Memory Leaks (1 test)**
- ✅ Does not leak memory when mounting and unmounting

## Running Tests

### Run All Tests
```bash
pnpm test
```

### Run Tests in Watch Mode
```bash
pnpm test -- --watch
```

### Run Tests with Coverage
```bash
pnpm test -- --coverage
```

### Run Specific Test File
```bash
pnpm test Video.test
```

### Run Tests with UI
```bash
pnpm test -- --ui
```

## Test Utilities

### Global Mocks (setup.ts)

- **fetch**: Mocked globally for API testing
- **IntersectionObserver**: Mocked for lazy loading tests
- **HTMLVideoElement.canPlayType**: Mocked for HLS detection
- **HTMLVideoElement.playsInline**: Mocked property
- **HTMLVideoElement.poster**: Mocked property with getter/setter

### Testing Library Matchers

All tests use @testing-library/jest-dom matchers:
- `toBeInTheDocument()`
- `toHaveTextContent()`
- `toHaveAttribute()`
- `toBeDisabled()`
- etc.

## Test Best Practices

1. **Isolation**: Each test is independent and cleans up after itself
2. **Mocking**: External dependencies (fetch, hls.js) are properly mocked
3. **Async Handling**: Uses `waitFor` for async operations
4. **Debug Support**: Debug logging is tested without polluting output
5. **Edge Cases**: Comprehensive edge case coverage
6. **Type Safety**: TypeScript ensures type correctness
7. **Realistic Scenarios**: Tests mimic real-world usage patterns

## Coverage Goals

- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

## Continuous Integration

Tests should be run:
- ✅ Before commits (via husky pre-commit hook)
- ✅ Before npm publish (via prepublishOnly script)
- ✅ In CI/CD pipeline
- ✅ During development (watch mode)

## Adding New Tests

When adding new features:

1. Add unit tests for new utilities
2. Add component tests for new props/behavior
3. Add integration tests if needed
4. Update smoke tests if public API changes
5. Ensure coverage remains > 90%
6. Run full test suite before committing

## Test Philosophy

- **Unit Tests**: Test individual functions in isolation
- **Component Tests**: Test React components with realistic props
- **Integration Tests**: Test multiple components working together
- **Smoke Tests**: Ensure basic functionality works

## Known Limitations

- HLS.js is mocked in tests (not using real HLS playback)
- Browser-specific behavior is simulated (not tested in real browsers)
- Network requests are mocked (not hitting real APIs)

For end-to-end testing with real browsers and APIs, consider using Playwright or Cypress.

## Test Maintenance

- Review and update tests when:
  - Adding new features
  - Fixing bugs
  - Refactoring code
  - Updating dependencies
  - Changing public API

- Keep tests:
  - Fast (< 2 seconds total)
  - Reliable (no flaky tests)
  - Readable (clear test names)
  - Maintainable (DRY principle)
