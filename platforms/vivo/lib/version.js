function parseTag(tag, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$`).exec(tag);
  return match && { tag, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function parseTags(tags, prefix) {
  const parsed = tags.map((tag) => parseTag(tag, prefix)).filter(Boolean);
  const malformed = tags.find((tag) => tag.startsWith(prefix) && !parseTag(tag, prefix));
  if (malformed) throw new Error(`invalid vivo release tag ${malformed}`);
  return parsed;
}

function resolveVersion(config, { allTags, headTags }) {
  const [baseMajor, baseMinor, basePatch] = config.versionBaseline.name.split('.').map(Number);
  const parsed = parseTags(allTags, config.tagPrefix);
  const current = parseTags(headTags, config.tagPrefix);
  const foreignSeries = [...parsed, ...current].find((item) => item.major !== baseMajor || item.minor !== baseMinor);
  if (foreignSeries) throw new Error('update versionBaseline before changing release series');
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
