import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  ReviewReportSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema,
  ReviewReportJSONSchema
} from '../src/types/index.js';

const validQuality = {
  file: 'src/app.js',
  issues: [
    {
      line: 10,
      severity: 'high',
      category: 'security',
      description: 'User input is written to innerHTML',
      suggestion: 'Use textContent instead'
    }
  ],
  overallScore: 70,
  summary: 'One security issue found'
};

const validCoverage = {
  file: 'src/app.js',
  hasTests: false,
  testFiles: [],
  untestedPaths: [
    {
      type: 'function',
      location: 'addTodo',
      priority: 'high',
      reasoning: 'Core feature with no tests',
      suggestedTest: "addTodo('') should be rejected and todos.length stays 0"
    }
  ],
  coverageEstimate: 0,
  summary: 'No tests present'
};

const validRefactor = {
  file: 'src/app.js',
  suggestions: [
    {
      type: 'modernize',
      location: 'lines 5-9',
      impact: 'low',
      description: 'Replace var with const',
      before: 'var a = 1;',
      after: 'const a = 1;',
      benefits: 'Block scoping'
    }
  ],
  summary: 'Minor modernization'
};

const validReport = {
  pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
  fileReviews: [
    {
      file: 'src/app.js',
      codeQuality: validQuality,
      testCoverage: validCoverage,
      refactorings: validRefactor
    }
  ],
  summary: {
    totalFiles: 1,
    overallScore: 72,
    criticalIssues: 1,
    highPriorityTests: 1,
    refactoringOpportunities: 1
  },
  recommendations: [
    { priority: 'high', category: 'security', description: 'Fix XSS', files: ['src/app.js'] }
  ],
  metadata: {
    analyzedAt: '2026-01-01T00:00:00.000Z',
    duration: 1234,
    agentVersions: { 'code-quality-analyzer': '1.0.0' }
  }
};

describe('CodeQualityResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => CodeQualityResultSchema.parse(validQuality)).not.toThrow();
  });
  it('rejects a missing field', () => {
    const { summary, ...bad } = validQuality;
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects an invalid severity', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], severity: 'urgent' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects a wrong type for line', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], line: 'ten' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('accepts an empty issues array', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, issues: [] })).not.toThrow();
  });
  it('accepts boundary scores 0 and 100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 0 })).not.toThrow();
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 100 })).not.toThrow();
  });
  it('rejects scores outside 0-100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: -1 })).toThrow(ZodError);
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 101 })).toThrow(ZodError);
  });
});

describe('TestCoverageResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => TestCoverageResultSchema.parse(validCoverage)).not.toThrow();
  });
  it('rejects an invalid priority', () => {
    const bad = { ...validCoverage, untestedPaths: [{ ...validCoverage.untestedPaths[0], priority: 'urgent' }] };
    expect(() => TestCoverageResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects coverage above 100', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, coverageEstimate: 150 })).toThrow(ZodError);
  });
  it('accepts empty arrays and boundary coverage', () => {
    const data = { ...validCoverage, untestedPaths: [], testFiles: [], coverageEstimate: 100 };
    expect(() => TestCoverageResultSchema.parse(data)).not.toThrow();
  });
  it('rejects a non-boolean hasTests', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, hasTests: 'no' })).toThrow(ZodError);
  });
});

describe('RefactoringSuggestionSchema', () => {
  it('accepts valid data', () => {
    expect(() => RefactoringSuggestionSchema.parse(validRefactor)).not.toThrow();
  });
  it('rejects an invalid suggestion type', () => {
    const bad = { ...validRefactor, suggestions: [{ ...validRefactor.suggestions[0], type: 'rewrite' }] };
    expect(() => RefactoringSuggestionSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects an invalid impact value', () => {
    const bad = { ...validRefactor, suggestions: [{ ...validRefactor.suggestions[0], impact: 'huge' }] };
    expect(() => RefactoringSuggestionSchema.parse(bad)).toThrow(ZodError);
  });
  it('accepts an empty suggestions array', () => {
    expect(() => RefactoringSuggestionSchema.parse({ ...validRefactor, suggestions: [] })).not.toThrow();
  });
});

describe('ReviewReportSchema', () => {
  it('accepts a valid report', () => {
    expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
  });
  it('accepts empty fileReviews and recommendations', () => {
    const data = { ...validReport, fileReviews: [], recommendations: [] };
    expect(() => ReviewReportSchema.parse(data)).not.toThrow();
  });
  it('rejects a missing pullRequest', () => {
    const { pullRequest, ...bad } = validReport;
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects an invalid recommendation priority', () => {
    const bad = { ...validReport, recommendations: [{ ...validReport.recommendations[0], priority: 'info' }] };
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects a non-numeric PR number', () => {
    const bad = { ...validReport, pullRequest: { ...validReport.pullRequest, number: '1' } };
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('safeParse reports failure instead of throwing', () => {
    const result = ReviewReportSchema.safeParse({ nope: true });
    expect(result.success).toBe(false);
  });
});

describe('JSON Schema export', () => {
  it('exports object schemas with required properties', () => {
    for (const schema of [
      CodeQualityResultJSONSchema,
      TestCoverageResultJSONSchema,
      RefactoringSuggestionJSONSchema,
      ReviewReportJSONSchema
    ]) {
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
    }
  });
  it('marks the right report fields as required', () => {
    const required = ReviewReportJSONSchema.required as string[];
    for (const key of ['pullRequest', 'fileReviews', 'summary', 'recommendations', 'metadata']) {
      expect(required).toContain(key);
    }
  });
  it('is serialisable to JSON', () => {
    expect(() => JSON.stringify(ReviewReportJSONSchema)).not.toThrow();
  });
});
