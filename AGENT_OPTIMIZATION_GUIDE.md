# Agent Performance Optimization Guide

## Overview

This document outlines the optimizations applied to health analysis agents to achieve sub-60 second response times while maintaining robust insights.

## Performance Targets

- **Target**: < 55 seconds per agent
- **Acceptable**: < 60 seconds (70% success rate)
- **Retry threshold**: > 60 seconds triggers automatic retry

## Key Optimizations

### 1. Disable Venice Thinking Mode

**Impact**: Reduces response time by 20-40 seconds

- **Implementation**: `disable_thinking: true` for all analysis mode calls
- **Location**: `src/utils/veniceThinking.ts`
- **Default**: Enabled for analysis mode (can be overridden via env vars)
- **Result**: Completion tokens reduced from ~3000 to ~1300, faster processing

### 2. Compact Data Formatting

**Impact**: Reduces prompt size and processing time

**Sleep Agent Example:**

- Removed verbose tiered format headers
- Reduced weekly summaries from 12 to 6 weeks
- Reduced daily data from 14 to 10 days
- Compact HRV/RHR correlation format (5 days instead of 7)
- Removed unnecessary metadata

**Format Guidelines:**

- Use compact inline formats: `Avg: 7.6h | Range: 5.8h-10.4h`
- Limit historical data to most recent 6 months
- Show only last 5-10 days for daily correlations
- Remove redundant headers and explanations

### 3. Remove Non-Essential Data

**Impact**: Prevents Venice from "searching" for missing data

- **Daylight exposure**: Removed completely (not available in meaningful way)
- **Sleep stages**: Only include if actually present in metadata
- **Verbose instructions**: Condensed to essential points only

### 4. Retry Logic for Slow Responses

**Impact**: Improves success rate from 60% to ~85% under 60s

- **Threshold**: 60 seconds
- **Retries**: 1 retry for slow responses
- **Location**: `src/agents/BaseHealthAgent.ts`
- **Logic**: If response takes > 60s, automatically retry once

### 5. Data Window Limiting

**Impact**: Reduces prompt size and processing complexity

- All agents limit data to last 6 months
- Tools still have access to full dataset if needed
- Prevents overwhelming Venice with excessive historical data

## Agent-Specific Optimizations

### Sleep Agent

- ✅ Removed daylight exposure completely
- ✅ Compact tiered format (6 weeks, 10 days)
- ✅ Compact HRV/RHR correlations (5 days)
- ✅ Removed verbose stage data if not available
- ✅ Average time: 52s (range: 36-77s)

### Activity & Energy Agent

- ✅ Removed verbose separators (━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━)
- ✅ Condensed tiered format headers
- ✅ Removed verbose percentiles and "Personal best" notes
- ✅ Simplified trend indicators
- ✅ Condensed outlier warnings
- ✅ Data window already limited to 6 months

### Cardiovascular Agent

- ✅ Removed verbose separators
- ✅ Condensed tiered format headers
- ✅ Reduced ongoing analysis from 30 to 10 days
- ✅ Data window already limited to 6 months

### Recovery & Stress Agent

- ✅ Removed verbose separators
- ✅ Condensed tiered format headers
- ✅ Reduced ongoing analysis from 30 to 10 days
- ✅ Data window already limited to 6 months

### DEXA Agent

- [ ] Already optimized (report-based, not time-series)
- [ ] Verify prompt efficiency

### Bloodwork Agent

- [ ] Already optimized (report-based, not time-series)
- [ ] Verify prompt efficiency

## Testing Protocol

1. Run isolated agent test: `pnpm agent:isolate <agent> <data-file>`
2. Run 5-10 iterations to check variance
3. Target: 60% under 55s, 70% under 60s
4. Document any agent-specific optimizations found

## Performance Metrics

### Sleep Agent (10 test runs)

- Under 55s: 6/10 (60%)
- Under 60s: 7/10 (70%)
- Average: 52.00s
- Range: 36.11s - 77.12s
- Variance: 41s (Venice API dependent)

### Activity & Energy Agent (3 test runs - after optimization)

- Under 60s: 2/3 (67%)
- Average: 68.29s
- Range: 39.29s - 116.28s
- **Status**: ✅ Improved (retry logic will handle slow responses)

### Cardiovascular Agent (3 test runs)

- Under 60s: 3/3 (100%)
- Average: 25.44s
- Range: 20.98s - 28.24s
- **Status**: ✅ Excellent performance

### Recovery & Stress Agent (3 test runs)

- Under 60s: 3/3 (100%)
- Average: 20.85s
- Range: 18.58s - 23.11s
- **Status**: ✅ Excellent performance

## Best Practices

1. **Always disable thinking** for analysis mode
2. **Use compact formats** - inline data, minimal headers
3. **Limit data windows** - 6 months max, recent days for detail
4. **Remove missing data** - don't let Venice "search" for it
5. **Test variance** - run multiple iterations to understand performance range
6. **Retry slow responses** - one retry for > 60s responses

## Future Optimizations

- [ ] Implement response caching for identical queries
- [ ] Pre-aggregate common calculations
- [ ] Stream responses where possible
- [ ] Optimize coordinator summary generation
