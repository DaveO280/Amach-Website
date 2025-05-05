# AmachHealth Development Guide

## Table of Contents

1. [Application Architecture](#application-architecture)
2. [API Integration](#api-integration)
3. [Data Management](#data-management)
4. [Component Standards](#component-standards)
5. [Styling Guidelines](#styling-guidelines)
6. [Security Practices](#security-practices)
7. [Performance Optimization](#performance-optimization)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Process](#deployment-process)

## Application Architecture

### Core Technologies

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Venice AI API
- Health Data Integration

### Directory Structure

```
src/
├── app/                    # Next.js app router pages
├── components/            # Reusable UI components
├── store/                # State management
├── api/                  # API services and utilities
├── rules/               # Application-wide rules
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

### State Management

- Zustand for global state
- React Context for component-specific state
- Local storage for persistence

## API Integration

### Venice AI API

- Endpoint: `https://api.venice.ai/api/v1`
- Model: `llama-3.1-405b`
- Configuration:
  ```typescript
  {
    maxTokens: 2000,
    temperature: 0.7,
    timeout: 60000,
    retryAttempts: 2
  }
  ```

### Health Data API

- Refresh interval: 5 minutes
- Required metrics:
  - Heart rate
  - Steps
  - Active energy
  - Exercise time
  - Sleep

## Data Management

### Health Data Structure

```typescript
interface HealthData {
  heartRate: number; // bpm
  steps: number; // steps
  activeEnergy: number; // calories
  exerciseTime: number; // minutes
  sleep: number; // hours
}
```

### Data Validation Rules

- Heart rate: 30-220 bpm
- Steps: 0-50,000
- Active energy: 0-5,000 calories
- Exercise time: 0-1,440 minutes
- Sleep: 0-24 hours

## Component Standards

### Button Component

```typescript
interface ButtonProps {
  size: "sm" | "md" | "lg";
  variant: "primary" | "secondary" | "outline";
  onClick: () => void;
  children: React.ReactNode;
}
```

### Input Component

```typescript
interface InputProps {
  size: "sm" | "md" | "lg";
  type: "text" | "number" | "email";
  value: string;
  onChange: (value: string) => void;
  error?: string;
}
```

## Styling Guidelines

### Color Palette

```typescript
{
  primary: "#4F46E5",
  secondary: "#10B981",
  accent: "#F59E0B",
  background: "#F9FAFB",
  text: {
    primary: "#111827",
    secondary: "#6B7280",
    light: "#9CA3AF"
  }
}
```

### Typography

- Primary font: Inter
- Secondary font: Roboto
- Font sizes: 0.875rem to 2rem
- Font weights: 300 to 700

## Security Practices

### API Security

- Rate limiting: 60 requests per minute
- Request size limit: 1MB
- API key management: Server-side only

### Data Security

- Encryption: AES-GCM
- Key length: 256 bits
- Input sanitization
- XSS prevention

## Performance Optimization

### Caching Strategy

- Health data: 5 minutes TTL
- AI responses: 1 hour TTL
- Maximum cache size: 100 items

### Resource Loading

- Maximum concurrent requests: 5
- Request timeout: 30 seconds
- Retry delay: 1 second

## Testing Strategy

### Unit Tests

- Component testing with React Testing Library
- API service testing with Jest
- State management testing

### Integration Tests

- API integration testing
- Health data flow testing
- User interaction testing

## Deployment Process

### Development

1. Create feature branch
2. Implement changes
3. Run tests
4. Create pull request
5. Code review
6. Merge to main

### Production

1. Version bump
2. Build application
3. Run tests
4. Deploy to production
5. Monitor performance

## Best Practices

### Code Quality

- Follow TypeScript best practices
- Use ESLint and Prettier
- Write meaningful comments
- Document complex logic

### Git Workflow

- Use semantic commit messages
- Keep commits small and focused
- Create descriptive PRs
- Review code before merging

### Error Handling

- Use try-catch blocks
- Log errors appropriately
- Provide user-friendly messages
- Implement retry logic

## Troubleshooting

### Common Issues

1. API key not loading

   - Check .env.local file
   - Verify environment variables
   - Restart development server

2. Health data not updating

   - Check refresh interval
   - Verify API permissions
   - Monitor network requests

3. Performance issues
   - Check cache implementation
   - Monitor API response times
   - Optimize component rendering

## Resources

### Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Venice AI API Documentation](https://docs.venice.ai)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

### Tools

- [ESLint](https://eslint.org)
- [Prettier](https://prettier.io)
- [Jest](https://jestjs.io)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
