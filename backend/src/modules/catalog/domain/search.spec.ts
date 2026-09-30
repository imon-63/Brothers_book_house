import { containsPattern, escapeLike, MAX_SEARCH_TOKENS, normaliseQuery, searchTokens } from './search';

describe('search helpers', () => {
  it('normalises whitespace', () => {
    expect(normaliseQuery('  নবম   দশম ')).toBe('নবম দশম');
    expect(normaliseQuery(undefined)).toBe('');
  });
  it('tokens are lowercase, unique, longest first, capped', () => {
    expect(searchTokens('Mini UPS mini')).toEqual(['mini', 'ups']);
    expect(searchTokens('a b c d e f g h').length).toBe(MAX_SEARCH_TOKENS);
    expect(searchTokens('   ')).toEqual([]);
  });
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(containsPattern('মধু')).toBe('%মধু%');
  });
});
