function parseTag(tag, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(tag);
  return match && { tag, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function resolveVersion(config, { allTags, headTags }) {
  const [baseMajor, baseMinor, basePatch] = config.versionBaseline.name.split('.').map(Number);
  const parsed = allTags.map((tag) => parseTag(tag, config.tagPrefix)).filter(Boolean);
  const malformed = allTags.find((tag) => tag.startsWith(config.tagPrefix) && !parseTag(tag, config.tagPrefix));
  if (malformed) throw new Error(`invalid vivo release tag ${malformed}`);
  const foreignSeries = parsed.find((item) => item.major !== baseMajor || item.minor !== baseMinor);
  if (foreignSeries) throw new Error('update versionBaseline before changing release series');
  const current = headTags.map((tag) => parseTag(tag, config.tagPrefix)).filter(Boolean);
  if (current.length > 1) throw new Error('current commit has multiple vivo release tags');
  const selected = current[0] || parsed.sort((a, b) => b.patch - a.patch)[0];
  const patch = current.length ? selected.patch : Math.max(basePatch, selected?.patch || basePatch) + 1;
  if (patch < basePatch) throw new Error('release tag precedes versionBaseline');
  const versionName = `${baseMajor}.${baseMinor}.${patch}`;
  return {
    versionName,
    versionCode: config.versionBaseline.code + patch - basePatch,
    tag: `${config.tagPrefix}${versionName}`,
    reused: current.length === 1,
  };
}

module.exports = { parseTag, resolveVersion };
