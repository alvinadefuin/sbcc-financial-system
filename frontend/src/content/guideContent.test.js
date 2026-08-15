import { GUIDE_TOPICS, getGuideTopics } from './guideContent';

// getGuideTopics returns [{ group, topics }] — most assertions want a flat list.
const flatten = (groups) => groups.flatMap((g) => g.topics);

test('every topic id is unique', () => {
  const ids = GUIDE_TOPICS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('every topic carries the fields the renderers need', () => {
  expect(GUIDE_TOPICS.length).toBeGreaterThan(0);
  GUIDE_TOPICS.forEach((topic) => {
    expect(typeof topic.title).toBe('string');
    expect(topic.title.length).toBeGreaterThan(0);
    expect(topic.summary.length).toBeGreaterThan(0);
    expect(topic.group.length).toBeGreaterThan(0);
    expect(topic.icon).toBeTruthy();
    expect(Array.isArray(topic.steps)).toBe(true);
    expect(topic.steps.length).toBeGreaterThan(0);
    topic.steps.forEach((step) => expect(step.length).toBeGreaterThan(0));
    expect(['user', 'admin', 'super_admin']).toContain(topic.minRole);
    expect(['mobile', 'desktop']).toContain(topic.platform);
  });
});

test('the mobile guide returns only mobile topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'mobile', role: 'user' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.platform).toBe('mobile'));
});

test('the desktop guide returns only desktop topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'super_admin' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.platform).toBe('desktop'));
});

test('a plain user never receives admin instructions', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'user' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.minRole).toBe('user'));
});

test('an admin receives admin topics but no super-admin topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'admin' }));
  expect(topics.some((t) => t.minRole === 'admin')).toBe(true);
  expect(topics.some((t) => t.minRole === 'super_admin')).toBe(false);
});

test('a super admin receives every desktop topic', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'super_admin' }));
  const allDesktop = GUIDE_TOPICS.filter((t) => t.platform === 'desktop');
  expect(topics.length).toBe(allDesktop.length);
});

// Failing closed matters: a bad role value must never leak admin instructions.
test.each([['nonsense'], [undefined], [null]])(
  'an unrecognised role (%s) is treated as a plain user',
  (role) => {
    const actual = flatten(getGuideTopics({ platform: 'desktop', role }));
    const asUser = flatten(getGuideTopics({ platform: 'desktop', role: 'user' }));
    expect(actual.map((t) => t.id)).toEqual(asUser.map((t) => t.id));
  }
);

test('groups with no visible topics are omitted entirely', () => {
  const groups = getGuideTopics({ platform: 'desktop', role: 'user' });
  groups.forEach((group) => expect(group.topics.length).toBeGreaterThan(0));
  expect(groups.map((g) => g.group)).not.toContain('Audit');
});

test('a group appears once, holding all of its topics', () => {
  const groups = getGuideTopics({ platform: 'mobile', role: 'user' });
  const names = groups.map((g) => g.group);
  expect(new Set(names).size).toBe(names.length);
});
