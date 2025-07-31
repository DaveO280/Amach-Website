# Daily Health Score Calculator

This module provides functionality to calculate health scores for each day in a dataset, using the same algorithms as the Health Score Cards but applied to daily data instead of aggregated metrics.

## Overview

The daily health score calculator:

1. Groups health metrics by date
2. Calculates health scores for each day using the same logic as the overall health scores
3. Stores the results in IndexDB for persistence
4. Provides utility functions for retrieving the stored scores

## Key Features

- **Same Algorithm**: Uses identical calculation logic to the Health Score Cards
- **Daily Granularity**: Calculates scores for each individual day in the dataset
- **IndexDB Storage**: Automatically stores results in browser's IndexDB
- **Type Safety**: Fully typed with TypeScript
- **Error Handling**: Robust error handling for edge cases

## Usage

### Basic Usage

```typescript
import {
  calculateDailyHealthScores,
  getDailyHealthScores,
} from "@/utils/dailyHealthScoreCalculator";

// Calculate daily scores
const dailyScores = calculateDailyHealthScores(healthData, userProfile);

// Retrieve stored scores
const storedScores = await getDailyHealthScores();
```

### Integration with Health Context

The daily health scores are automatically calculated and stored when:

1. Health data is processed in the HealthDataContextWrapper
2. User profile information is available
3. Raw health data is present

### Data Structure

```typescript
interface DailyHealthScores {
  date: string; // ISO date string (YYYY-MM-DD)
  scores: HealthScore[]; // Array of 5 health scores
}

interface HealthScore {
  type: string; // 'overall', 'activity', 'sleep', 'heart', 'energy'
  value: number; // Score from 0-100
  date: string; // ISO timestamp
}
```

## Score Types

Each day includes 5 health scores:

1. **Overall**: Weighted average of all component scores
2. **Activity**: Based on steps, exercise time, and respiratory rate
3. **Sleep**: Based on sleep duration and quality
4. **Heart**: Based on HRV, resting heart rate, and heart rate variability
5. **Energy**: Based on active energy balance

## Calculation Logic

The daily scores use the exact same algorithms as the Health Score Cards:

- **Sleep Quality Score**: 70% duration + 30% efficiency
- **Heart Health Score**: 40% HRV + 30% resting HR + 30% HR variability
- **Physical Activity Score**: 40% steps + 30% exercise + 20% respiratory + 10% activity level
- **Energy Balance Score**: Based on BMR calculation and activity level
- **Overall Score**: 25% each of activity, sleep, heart, and energy scores

## Storage

Daily health scores are stored in IndexDB with:

- **Database**: `amach-health-db`
- **Store**: `daily-scores`
- **Key**: `current`

## Error Handling

The system includes comprehensive error handling:

- Invalid data points are skipped
- Missing user profile uses sensible defaults
- IndexDB errors are logged but don't crash the application
- Type safety prevents runtime errors

## Testing

Run the tests with:

```bash
npm test -- --testPathPattern=dailyHealthScoreCalculator.test.ts
```

## Future Enhancements

- Visualization components for daily score trends
- Score comparison between days
- Trend analysis and predictions
- Export functionality for daily scores
