import { describe, expect, it } from 'vitest';
import { toServerSortOrder } from './ConnectionTable.constants';

describe('toServerSortOrder', () => {
  it('maps camelCase wire fields to the server DB sort columns', () => {
    expect(toServerSortOrder('createdAt desc')).toBe('created_at desc');
    expect(toServerSortOrder('createdAt asc')).toBe('created_at asc');
    expect(toServerSortOrder('updatedAt desc')).toBe('updated_at desc');
  });

  it('passes through fields the server already understands', () => {
    expect(toServerSortOrder('name asc')).toBe('name asc');
    // Older bookmarked URLs may still carry the snake_case form.
    expect(toServerSortOrder('created_at desc')).toBe('created_at desc');
  });

  it('tolerates a bare field with no direction', () => {
    expect(toServerSortOrder('createdAt')).toBe('created_at');
  });
});
